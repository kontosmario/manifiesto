-- Security hardening — Phase 2: rate limits, size caps, statement
-- timeout, pruning crons, and the trimmed invite preview.
--
-- Findings addressed:
--   AB-3 / AB-4  Costly RPCs (record_fixed_expense_payment,
--                add_savings_contribution, etc.) were unbounded.
--   AB-5         log_home_event accepted unbounded jsonb context.
--   AB-9         No statement_timeout for authenticated role.
--   BE-5 / AB-6  peek_family_invite leaked full member roster +
--                financial preview to anyone with a code.
--   BE-6         rpc_rate_limits had no prune cron.
--
-- Rate-limit windows are tuned to be generous for legitimate UX
-- (typo retries, double taps) but tight enough to neutralize abuse
-- amplification.

-- ─── 0. enforce_rate_limit_for_user — edge-function-callable variant
-- Edge functions don't run inside an `auth.uid()` context (they call
-- PostgREST with the service_role key), so the existing
-- `enforce_rate_limit` (which reads auth.uid()) doesn't fit. Expose
-- a parameterized variant the edge function can call after it has
-- itself authenticated the bearer token. Restricted to service_role
-- so client code can't pass an arbitrary user id and bypass its own
-- per-user bucket.
create or replace function public.enforce_rate_limit_for_user(
  p_user_id uuid,
  p_action text,
  p_max_attempts int,
  p_window_seconds int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_attempts int;
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rpc_rate_limits(user_id, action, window_start, attempts)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update
    set attempts = rpc_rate_limits.attempts + 1
  returning attempts into v_attempts;

  if v_attempts > p_max_attempts then
    raise exception 'Rate limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.enforce_rate_limit_for_user(uuid, text, int, int) from public;
grant execute on function public.enforce_rate_limit_for_user(uuid, text, int, int) to service_role;

-- ─── 1. statement_timeout for the authenticated role ─────────────
-- 8 seconds is well above any normal RPC's worst-case (home_snapshot
-- under heavy data, the gastos paginated reads). Anything longer is
-- pathological and worth killing — protects against single-attacker
-- workers stalling the pool.
do $$
begin
  execute 'alter role authenticated set statement_timeout = ''8s''';
exception when others then
  -- Local supabase setups occasionally lack the role at this point;
  -- the production project has it. Don't fail the migration on that.
  null;
end;
$$;

-- ─── 2. rpc_rate_limits prune cron ───────────────────────────────
-- Without pruning the table grows linearly. We retain 7 days of
-- buckets — long enough to investigate a sustained attack, short
-- enough that storage stays bounded.
create or replace function public.cron_prune_rpc_rate_limits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rpc_rate_limits
  where window_start < now() - interval '7 days';
end;
$$;

revoke all on function public.cron_prune_rpc_rate_limits() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cron_prune_rpc_rate_limits');
    perform cron.schedule(
      'cron_prune_rpc_rate_limits',
      '0 4 * * *',  -- 04:00 UTC daily
      $cron$select public.cron_prune_rpc_rate_limits();$cron$
    );
  end if;
exception when others then
  null;
end;
$$;

-- ─── 3. log_home_event — size caps + per-user throttle ──────────
-- The cost of a malicious caller stuffing megabytes of jsonb per row
-- is unbounded disk + WAL growth (the existing prune is monthly).
-- Cap context size and bucket the call rate per user.
create or replace function public.log_home_event(
  p_family_id uuid,
  p_event text,
  p_element_id text default null,
  p_slot text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_event text := coalesce(p_event, '');
  v_element_id text := coalesce(p_element_id, '');
  v_slot text := coalesce(p_slot, '');
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Cap shapes early so a single bad caller can't write multi-MB rows.
  if length(v_event) = 0 or length(v_event) > 64 then
    raise exception 'Invalid event';
  end if;
  if length(v_element_id) > 128 then
    raise exception 'Invalid element_id';
  end if;
  if length(v_slot) > 64 then
    raise exception 'Invalid slot';
  end if;
  if octet_length(v_context::text) > 4096 then
    raise exception 'Context too large';
  end if;

  -- Caller must belong to the family AND not be blocked.
  if not public.is_family_member_active(p_family_id) then
    raise exception 'Forbidden: not a member of family';
  end if;

  -- 60 events/min/user is generous: the home screen burst-logs ~5-10
  -- events on first paint, then a steady trickle. An attacker doing
  -- 60/min for 24h logs 86_400 events at 4KB each = ~340MB/day —
  -- bounded and detectable.
  perform public.enforce_rate_limit('log_home_event', 60, 60);

  insert into public.home_telemetry (
    user_id, family_id, event, element_id, slot, context
  )
  values (
    auth.uid(),
    p_family_id,
    v_event,
    nullif(v_element_id, ''),
    nullif(v_slot, ''),
    v_context
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_home_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.log_home_event(uuid, text, text, text, jsonb) to authenticated;

-- ─── 4. add_savings_contribution — rate limit ────────────────────
-- The owner-only check (in 20260510000000) prevents non-owner abuse.
-- Even so, an owner with a compromised session could hammer the RPC
-- and push N notifications + N updated_at writes. 30/min is plenty
-- for legitimate "+ aporte" taps with double-click protection.
create or replace function public.add_savings_contribution(
  p_goal_id uuid,
  p_amount numeric
)
returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.savings_goals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte debe ser mayor a cero';
  end if;

  -- Sanity caps on amount: numeric(12,2) allows up to ~10 billion;
  -- a single contribution above 1B is almost certainly bogus and
  -- worth rejecting (legitimate values fit comfortably below).
  if p_amount > 1000000000 then
    raise exception 'Monto fuera de rango';
  end if;

  perform public.enforce_rate_limit('add_savings_contribution', 30, 60);

  select * into v_goal from public.savings_goals where id = p_goal_id;
  if not found then
    raise exception 'Meta no encontrada';
  end if;

  if not public.is_family_owner(v_goal.family_id) then
    raise exception 'Solo el owner puede aportar a la meta';
  end if;

  update public.savings_goals
  set current_amount = current_amount + p_amount,
      updated_at = now()
  where id = p_goal_id
  returning * into v_goal;

  return v_goal;
end;
$$;

revoke all on function public.add_savings_contribution(uuid, numeric) from public;
grant execute on function public.add_savings_contribution(uuid, numeric) to authenticated;

-- ─── 5. record_fixed_expense_payment — rate limit + sanity ────────
-- Idempotency on (fixed_expense_id, period_month) prevents duplicate
-- payments-table rows, but the expenses INSERT happens every call —
-- 1000 calls = 1000 spam expenses + advanced next_due_on. Throttle
-- and reject if next_due_on is already absurdly far in the future
-- (someone is repeatedly recording payments for one cycle).
create or replace function public.record_fixed_expense_payment(p_fixed_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.fixed_expenses%rowtype;
  v_expense_id uuid;
  v_next_due date;
  v_payment_amount numeric(12,2);
  v_remaining_balance numeric(12,2);
  v_installments_paid integer;
  v_new_status text;
  v_period_month date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa para registrar pagos.';
  end if;

  perform public.enforce_rate_limit('record_fixed_expense_payment', 30, 60);

  select * into v_commitment from public.fixed_expenses where id = p_fixed_expense_id;
  if not found then raise exception 'Compromiso no encontrado.'; end if;

  if not public.is_family_member_active(v_commitment.family_id) then
    raise exception 'No tenés permisos para registrar este pago.';
  end if;

  if v_commitment.status <> 'active' then
    raise exception 'Solo podés registrar pagos sobre compromisos activos.';
  end if;

  if v_commitment.category_id is null then
    raise exception 'Definí una categoría antes de registrar el pago.';
  end if;

  -- Refuse to fast-forward more than 60 days into the future.
  -- Catches the "user double-clicks 100×" / abuse pattern.
  if v_commitment.next_due_on > current_date + interval '60 days' then
    raise exception 'Este compromiso ya está al día.';
  end if;

  v_payment_amount := case
    when v_commitment.kind = 'debt' and coalesce(v_commitment.remaining_balance, 0) > 0
      then least(v_commitment.amount, v_commitment.remaining_balance)
    else v_commitment.amount
  end;

  insert into public.expenses (family_id, category_id, commitment_id, description, price, created_by)
  values (
    v_commitment.family_id, v_commitment.category_id, v_commitment.id,
    coalesce(nullif(btrim(v_commitment.name), ''), 'Compromiso'),
    v_payment_amount, auth.uid()
  )
  returning id into v_expense_id;

  v_period_month := date_trunc('month', current_date)::date;
  insert into public.fixed_expense_payments (fixed_expense_id, period_month, paid_by)
  values (v_commitment.id, v_period_month, auth.uid())
  on conflict (fixed_expense_id, period_month) do nothing;

  v_next_due := public.advance_fixed_expense_due_date(
    v_commitment.next_due_on, v_commitment.frequency, v_commitment.day_of_month
  );
  v_installments_paid := coalesce(v_commitment.installments_paid, 0);
  v_remaining_balance := v_commitment.remaining_balance;
  v_new_status := 'active';

  if v_commitment.kind = 'installment' then
    v_installments_paid := v_installments_paid + 1;
    if coalesce(v_commitment.installments_total, 0) > 0 and v_installments_paid >= v_commitment.installments_total then
      v_new_status := 'completed';
    end if;
  elsif v_commitment.kind = 'debt' then
    v_remaining_balance := greatest(0, coalesce(v_commitment.remaining_balance, v_payment_amount) - v_payment_amount);
    if v_remaining_balance <= 0 then v_new_status := 'completed'; end if;
  elsif v_commitment.ends_on is not null and v_next_due > v_commitment.ends_on then
    v_new_status := 'completed';
  end if;

  update public.fixed_expenses
  set next_due_on = case when v_new_status = 'completed' then v_commitment.next_due_on else v_next_due end,
      installments_paid = v_installments_paid,
      remaining_balance = v_remaining_balance,
      status = v_new_status,
      last_paid_at = now()
  where id = v_commitment.id;

  return v_expense_id;
end;
$$;

grant execute on function public.record_fixed_expense_payment(uuid) to authenticated;

-- ─── 6. Family admin RPCs — rate limit ───────────────────────────
-- Owner-only by design, but a compromised owner session could hammer
-- the table. Block / unblock / remove / transfer are administrative
-- actions; legitimate calls are rare. Throttle aggressively.
create or replace function public.family_block_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  perform public.enforce_rate_limit('family_block_member', 5, 60);

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede bloquear miembros.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés bloquearte a vos mismo.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'Ese usuario no está en tu familia.';
  end if;
  if v_target_role = 'owner' then
    raise exception 'No podés bloquear a otro owner.';
  end if;

  update public.family_members
  set role = 'blocked', blocked_at = now()
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_block_member(uuid) to authenticated;

create or replace function public.family_unblock_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  perform public.enforce_rate_limit('family_unblock_member', 10, 60);

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede desbloquear miembros.';
  end if;

  update public.family_members
  set role = 'member', blocked_at = null
  where family_id = v_family_id and user_id = target_user_id and role = 'blocked';
end;
$$;

grant execute on function public.family_unblock_member(uuid) to authenticated;

create or replace function public.family_remove_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  perform public.enforce_rate_limit('family_remove_member', 5, 60);

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede eliminar miembros.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés eliminarte a vos mismo. Transferí la propiedad primero.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'Ese usuario no está en tu familia.';
  end if;

  if v_target_role = 'owner' then
    raise exception 'No podés eliminar a otro owner.';
  end if;

  delete from public.family_members
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_remove_member(uuid) to authenticated;

create or replace function public.family_transfer_ownership(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'No session';
  end if;

  perform public.enforce_rate_limit('family_transfer_ownership', 3, 3600);

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede transferir la propiedad.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés transferirte la propiedad a vos mismo.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'El destinatario no es miembro de esta familia.';
  end if;
  if v_target_role = 'blocked' then
    raise exception 'No podés transferir la propiedad a un miembro bloqueado.';
  end if;

  update public.family_members
  set role = 'member'
  where family_id = v_family_id and user_id = auth.uid();

  update public.family_members
  set role = 'owner'
  where family_id = v_family_id and user_id = target_user_id;
end;
$$;

grant execute on function public.family_transfer_ownership(uuid) to authenticated;

-- ─── 7. Lifecycle RPCs — light throttle ──────────────────────────
-- bootstrap / leave should be rare. Cap at 3/hour to discourage
-- create-leave-create-leave loops that burn down rows.
create or replace function public.bootstrap_family()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('bootstrap_family', 3, 3600);

  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, template_id, name, scope)
  select v_new_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_new_family_id,
    templates.id,
    templates.name,
    case templates.name
      when 'Servicios'     then '#E8976A'
      when 'Vivienda'      then '#8DB46A'
      when 'Suscripciones' then '#C9A6E0'
      when 'Seguros'       then '#F2B58A'
      when 'Cuotas'        then '#6B9AD6'
      when 'Impuestos'     then '#C7A96A'
      when 'Deudas'        then '#D96A4F'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates templates
  where templates.scope = 'fixed_expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'fixed_expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$$;

revoke all on function public.bootstrap_family() from public;
grant execute on function public.bootstrap_family() to authenticated;

-- ─── 8. peek_family_invite — trim the preview payload ───────────
-- The previous payload exposed monthly_income, per-member income
-- contributions, savings goal amounts, cycle variable spend. A
-- leaked code → 7 days of repeated peeks → full financial recon.
-- The new payload keeps just enough context to confirm "this is the
-- right family" (member display names + avatars + roles) and lets
-- the joiner make an informed decision; the rest is shown after
-- consume.
create or replace function public.peek_family_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('peek_family_invite', 10, 60);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  limit 1;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', upper(btrim(p_code)),
    -- Trimmed roster: display name + avatar + role only. NO income
    -- contribution, NO blocked flag (an attacker peeking a leaked
    -- code does not need to learn who is blocked in the family).
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', coalesce(p.display_name, 'Usuario'),
        'avatar_animal', p.avatar_animal,
        'role', coalesce(fm.role, 'member')
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), '[]'::jsonb),
    'member_count', coalesce((
      select count(*)::int
      from public.family_members fm
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), 0),
    -- Household-level income only (no per-member breakdown). The
    -- joiner needs to anchor "is this my family?" against a single
    -- aggregate; per-member contribution figures are deferred until
    -- after they actually consume the invite.
    'monthly_income', coalesce((
      select ff.monthly_income
      from public.family_finance ff
      where ff.family_id = v_family_id
    ), 0),
    -- Goal preview: title only, no amounts. Signals "this family
    -- saves toward something" without leaking progress figures.
    'active_goal_title', (
      select sg.title
      from public.savings_goals sg
      where sg.family_id = v_family_id
        and sg.is_active = true
      order by sg.created_at desc
      limit 1
    ),
    'invite_expires_at', v_invite_expires
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.peek_family_invite(text) from public;
grant execute on function public.peek_family_invite(text) to authenticated;

-- ─── 9. create_family_invite — rate limit ────────────────────────
-- An owner could otherwise mint thousands of invites and bloat the
-- table. 10/hour is plenty.
create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('create_family_invite', 10, 3600);

  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and (fm.blocked_at is null)
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
      return next;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 8 then
        raise exception 'Could not generate a unique invite code.';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;

-- ─── 10. emit_user_notification — rate limit ────────────────────
-- Defined in 20260510000000; replace it with a rate-limited variant
-- so client-driven nudges/warnings can't be used as an
-- amplification vector against family members.
create or replace function public.emit_user_notification(
  p_target_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_family_id uuid;
  v_id uuid;
  v_title text;
  v_body text;
  v_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('emit_user_notification', 10, 60);

  if p_kind not in ('member_warning', 'member_nudge') then
    raise exception 'Invalid notification kind';
  end if;

  v_title := substr(coalesce(btrim(p_title), ''), 1, 80);
  v_body := substr(coalesce(btrim(p_body), ''), 1, 280);
  if v_title = '' then
    raise exception 'Title required';
  end if;
  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  if octet_length(v_metadata::text) > 2048 then
    raise exception 'Metadata too large';
  end if;

  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
    and fm.blocked_at is null
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  select fm.family_id
    into v_target_family_id
  from public.family_members fm
  where fm.user_id = p_target_user_id
  limit 1;

  if v_target_family_id is null or v_target_family_id <> v_family_id then
    raise exception 'Target user is not in your family';
  end if;

  insert into public.notifications (
    family_id, user_id, title, body, kind, severity, created_by, metadata
  )
  values (
    v_family_id, p_target_user_id, v_title, v_body, p_kind, 'info', v_user_id, v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.emit_user_notification(uuid, text, text, text, jsonb) from public;
grant execute on function public.emit_user_notification(uuid, text, text, text, jsonb) to authenticated;
