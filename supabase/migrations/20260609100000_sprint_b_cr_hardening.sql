-- supabase/migrations/20260609100000_sprint_b_cr_hardening.sql
--
-- CR Sprint B findings hardening (2026-06-09):
--
-- #8 — rate limit ANTES de input validation = users gastan quota por bugs
--      del cliente. Reorden: validate → rate limit → mutation.
--
-- #1 — `auth.role() = 'service_role'` brittle. Edge functions usando
--      service-role key vía PostgREST vs `supabase.rpc()` directo pueden
--      dar role distinto. Belt-and-suspenders: chequear también
--      `current_user IN ('service_role','postgres','supabase_admin')`.
--
-- #2 — `audit_log` sin INSERT policy. Funciona hoy porque la trigger
--      function es SECURITY DEFINER owned por superuser → bypasea RLS.
--      Pero si se recrea bajo otro owner, INSERTs fallarían silentemente.
--      Agregamos policy explícita para service_role + postgres.
--
-- #3 — `raise warning` cuando audit_log INSERT falla MASKEA bugs reales
--      del audit trail. Mejora: segundo INSERT con `error` en payload
--      (best-effort), y SI ese también falla, raise warning como
--      ultimate fallback.
--
-- #9 — `consume_family_invite`: idempotent shortcut DESPUÉS de los
--      rate-limit. Re-tap del deep-link gasta quota innecesariamente.
--      Mover el shortcut antes de los throttlers.

-- ════════════════════════════════════════════════════════════════════
-- #8 + #9 · Reorder rate limit y idempotent shortcut
-- ════════════════════════════════════════════════════════════════════

-- apply_month_close_decision (V5): validations primero, rate-limit después
create or replace function public.apply_month_close_decision(
  p_monthly_summary_id uuid,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_summary record;
  v_sobrante numeric;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Validaciones primero (CR Sprint B #8): el rate limit solo cobra
  -- llamadas que pasaron toda la guarda de inputs, sino bugs del
  -- cliente gastan la quota del user.
  select id, family_id, monthly_income, total_spent, savings_delta
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not found';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  if p_decision = 'acumular' and p_new_cycle_anchor is null then
    raise exception 'acumular decision requires new_cycle_anchor';
  end if;

  -- Rate limit DESPUÉS de inputs OK. 5/h cubre retries por flap.
  perform public.check_rate_limit('apply_month_close_decision', 5, 3600);

  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
      - coalesce(v_summary.total_spent, 0)
      - coalesce(v_summary.savings_delta, 0)
  );

  insert into public.month_close_decisions (
    family_id, monthly_summary_id, sobrante, decision, meta_goal_id, decided_by
  ) values (
    v_summary.family_id, p_monthly_summary_id, v_sobrante,
    p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + v_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_summary.family_id;
  elsif p_decision = 'acumular' then
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + v_sobrante,
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = v_summary.family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;

-- apply_reserve_decision (V6): validations primero, rate-limit después
create or replace function public.apply_reserve_decision(
  p_amount numeric,
  p_target text,
  p_meta_goal_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_count int;
  v_updated int;
begin
  if v_user_id is null then raise exception 'No session'; end if;

  -- Validaciones primero (CR Sprint B #8).
  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  select count(*)
    into v_family_count
    from public.family_members
   where user_id = v_user_id
     and role <> 'blocked';
  if v_family_count > 1 then
    raise exception 'multi-family detected, p_family_id required';
  end if;

  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;
  if v_family_id is null then raise exception 'No family'; end if;

  -- Rate limit DESPUÉS de validaciones (CR Sprint B #8).
  perform public.check_rate_limit('apply_reserve_decision', 10, 3600);

  if p_target = 'cycle' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + p_amount,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
  elsif p_target = 'meta' then
    if not exists (select 1 from public.savings_goals where id = p_meta_goal_id and family_id = v_family_id) then
      raise exception 'meta goal does not belong to family';
    end if;
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
    update public.savings_goals
       set current_amount = current_amount + p_amount,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_family_id;
  end if;
end;
$$;

revoke all on function public.apply_reserve_decision(numeric, text, uuid) from public;
grant execute on function public.apply_reserve_decision(numeric, text, uuid) to authenticated;

-- consume_family_invite (V4): idempotent shortcut ANTES de los throttlers
create or replace function public.consume_family_invite(
  p_code text,
  p_contribution numeric default null
)
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_existing_family_id uuid;
  v_contribution numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotent shortcut PRIMERO (CR Sprint B #9): si el user ya tiene
  -- family, no gastamos rate-limit quota. Re-tap de deep-link es no-op.
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

  -- Throttle: 5/min (anti-bruteforce inmediato) + 3/día (slow-burn).
  perform public.enforce_rate_limit('consume_family_invite', 5, 60);
  perform public.check_rate_limit('consume_family_invite', 3, 86400);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  for update;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;

  update public.family_invites
  set consumed_by = v_user_id,
      consumed_at = now()
  where family_invites.code = upper(btrim(p_code));

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- #1 + #2 + #3 · Service-role audit hardening
-- ════════════════════════════════════════════════════════════════════

-- #2: policy explícita para INSERTs del trigger. Aunque hoy funciona
-- por owner=superuser, hacerlo load-bearing previene regresiones si
-- la function se recrea bajo otro owner.
drop policy if exists "audit_log_service_role_insert" on public.audit_log;
create policy "audit_log_service_role_insert"
  on public.audit_log for insert
  with check (
    -- service_role JWT, postgres role, o supabase_admin role
    (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
    or current_user in ('postgres', 'supabase_admin', 'service_role')
  );

-- #1 + #3: trigger function mejorada
create or replace function public.audit_service_role_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean;
  v_jwt_role text;
  v_target_id uuid;
  v_family_id uuid;
  v_user_id uuid;
begin
  -- CR Sprint B #1: belt-and-suspenders detection. `auth.role()` puede
  -- ser 'authenticated' o NULL desde edge functions usando service_role
  -- key vía direct pg connection. Chequear JWT claims explícitos +
  -- current_user como fallback.
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v_is_service_role := (
    auth.role() = 'service_role'
    or v_jwt_role = 'service_role'
    or current_user in ('service_role', 'postgres', 'supabase_admin')
  );

  if not v_is_service_role then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  -- Extract IDs defensivamente (algunas tablas como family_finance,
  -- family_members no tienen columna `id` independiente).
  begin
    v_target_id := case
      when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'id')::uuid
      else (to_jsonb(NEW)->>'id')::uuid
    end;
  exception when others then
    v_target_id := null;
  end;

  begin
    v_family_id := case
      when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'family_id')::uuid
      else (to_jsonb(NEW)->>'family_id')::uuid
    end;
  exception when others then
    v_family_id := null;
  end;

  begin
    v_user_id := case
      when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'user_id')::uuid
      else (to_jsonb(NEW)->>'user_id')::uuid
    end;
  exception when others then
    v_user_id := null;
  end;

  -- Primary write attempt.
  begin
    insert into public.audit_log (
      user_id, family_id, action, target_table, target_id, payload
    )
    values (
      v_user_id,
      v_family_id,
      'service_role_' || TG_OP || '_' || TG_TABLE_NAME,
      TG_TABLE_NAME::text,
      v_target_id,
      jsonb_build_object('op', TG_OP, 'jwt_role', v_jwt_role)
    );
  exception when others then
    -- #3: el primary INSERT falló. Best-effort segundo INSERT con
    -- detalle del error en payload, así el trail registra la falla
    -- en lugar de silenciar el gap completamente.
    begin
      insert into public.audit_log (
        user_id, family_id, action, target_table, target_id, payload
      )
      values (
        null, null,
        'audit_failure_' || TG_TABLE_NAME,
        TG_TABLE_NAME::text,
        null,
        jsonb_build_object(
          'op', TG_OP,
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        )
      );
    exception when others then
      -- Ultimate fallback: warning a los logs. No bloqueamos el write
      -- original — esa es la garantía explícita del trigger.
      raise warning 'audit_service_role_write double-failure on %.%: %',
        TG_TABLE_NAME, TG_OP, SQLERRM;
    end;
  end;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

comment on function public.audit_service_role_write() is
  'Service-role write audit. Belt-and-suspenders detection (CR Sprint B #1) + '
  'failure-recording fallback (CR Sprint B #3). Si el primary INSERT falla, '
  'intenta segundo INSERT con error en payload antes de degradar a warning.';
