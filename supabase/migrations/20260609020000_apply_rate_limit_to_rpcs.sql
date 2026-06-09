-- supabase/migrations/20260609020000_apply_rate_limit_to_rpcs.sql
--
-- Sprint B · B2 — Aplicar `check_rate_limit` a RPCs sensibles.
--
-- Cuotas (justificación):
--   • apply_month_close_decision  → 5 / hora
--       El close-of-month es un evento por user/mes; 5/h cubre retries
--       legítimos (network flap, double-tap) sin permitir abuso.
--   • apply_reserve_decision      → 10 / hora
--       Decisiones sobre reserva pueden suceder varias veces por sesión
--       (ej. dividir reserva entre cycle + meta). 10/h es holgado.
--   • consume_family_invite       → 3 / día
--       Joins legítimos son uno-y-listo. 3/día anti-bruteforce y
--       permite recuperarse de un error de tipeo manual.
--
-- Estrategia:
--   Recreamos las RPCs (CREATE OR REPLACE) preservando el cuerpo de la
--   versión más reciente de cada una (referencias abajo) y agregamos
--   `perform check_rate_limit(...)` como primer statement después de la
--   guarda `auth.uid()`.
--
-- Referencias a versiones base:
--   • apply_month_close_decision  → 20260608030000_harden_reserve_and_acumular_atomic.sql (V3)
--   • apply_reserve_decision      → 20260608130000_apply_reserve_multifamily_guard.sql (V4)
--   • consume_family_invite       → 20260507000500_invite_rate_limit.sql (V2)

-- ════════════════════════════════════════════════════════════════════
-- 1 · apply_month_close_decision (V4: + rate limit)
-- ════════════════════════════════════════════════════════════════════
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

  -- B2: rate limit 5 / hora por user. Este RPC suele dispararse una vez
  -- por cierre de ciclo; 5/h absorbe retries por flap de red sin abrir
  -- ventana de abuso.
  perform public.check_rate_limit('apply_month_close_decision', 5, 3600);

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
    if p_new_cycle_anchor is null then
      raise exception 'acumular decision requires new_cycle_anchor';
    end if;
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

-- ════════════════════════════════════════════════════════════════════
-- 2 · apply_reserve_decision (V5: + rate limit)
-- ════════════════════════════════════════════════════════════════════
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

  -- B2: rate limit 10 / hora por user. Aplicar reserva puede pasar
  -- varias veces por sesión (split reserva entre cycle + meta), pero
  -- nunca a tasas de abuso.
  perform public.check_rate_limit('apply_reserve_decision', 10, 3600);

  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  -- M4 guard: si el user pertenece a >1 familia activa, fallar
  -- explícitamente (ver 20260608130000 para el deep-dive).
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

-- ════════════════════════════════════════════════════════════════════
-- 3 · consume_family_invite (V3: + rate limit by hora-día)
-- ════════════════════════════════════════════════════════════════════
-- Mantenemos `enforce_rate_limit('consume_family_invite', 5, 60)` que
-- es la cuota antibruteforce por minuto. Sumamos `check_rate_limit` con
-- la cuota diaria del spec B2 (3/día) que protege contra ataques lentos
-- (slow-burn enumeration en background).
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

  -- Throttle por minuto (existing). BEFORE el idempotent-shortcut para
  -- que no se pueda bypassar via prior join.
  perform public.enforce_rate_limit('consume_family_invite', 5, 60);

  -- B2: rate limit 3 / día por user. Joins legítimos son uno-y-listo;
  -- 3/d permite recuperarse de un typo manual sin abrir bruteforce de
  -- larga duración.
  perform public.check_rate_limit('consume_family_invite', 3, 86400);

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
