-- supabase/migrations/20260608030000_harden_reserve_and_acumular_atomic.sql
--
-- Code review findings (2026-06-08):
--
-- H1: apply_reserve_decision derivaba la family vía
--   `select fm.family_id from family_members where user_id=auth.uid() limit 1`
-- sin filtrar role. Si un user pertenece a >1 familia (futuro), drenaba
-- una reserva arbitraria. Agregamos filtro `role <> 'blocked'` y
-- documentamos que la asunción actual es single-family-per-user. Cuando
-- se introduzca multi-family soporte real, esto debe migrar a aceptar
-- `p_family_id uuid` explícito como parameter.
--
-- H2: apply_month_close_decision rama 'acumular' tenía race latente:
--   select current_cycle_starting_balance, monthly_income into v_…
--   update … set current_cycle_starting_balance = coalesce(v_current_balance, …) + v_sobrante
-- Si el confirm-salary trigger fires entre el SELECT y el UPDATE, el
-- write pisa el valor leído (perdiendo el confirm). Mismo patrón estaba
-- replicado en apply_reserve_decision rama 'cycle'.
--
-- Fix: collapsar el read+write en UN solo UPDATE que referencia las
-- columnas en la misma row, eliminando la ventana de race.

-- ── apply_month_close_decision (V3) ─────────────────────────────────

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
    -- H2 fix: atomic UPDATE referenciando current_cycle_starting_balance
    -- y monthly_income en la misma row. Antes hacíamos SELECT INTO + UPDATE
    -- separados → race con triggers concurrentes.
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

-- ── apply_reserve_decision (V2) ─────────────────────────────────────

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
  v_current_reserve numeric;
begin
  if v_user_id is null then raise exception 'No session'; end if;
  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  -- H1 fix: filtrar role <> 'blocked'. Asume single-family-per-user
  -- (default actual del producto). Cuando se introduzca multi-family
  -- soporte, esto debe migrar a aceptar `p_family_id uuid` explícito.
  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;
  if v_family_id is null then raise exception 'No family'; end if;

  -- Validar que hay reserva suficiente. Single SELECT — no escribimos
  -- hasta abajo donde el UPDATE es atómico.
  select monthly_reserve_amount
    into v_current_reserve
    from public.family_finance
   where family_id = v_family_id;

  if coalesce(v_current_reserve, 0) < p_amount then
    raise exception 'amount exceeds reserve';
  end if;

  if p_target = 'cycle' then
    -- H2 fix análogo: atomic UPDATE sin read-then-write. Referencias a
    -- monthly_reserve_amount, current_cycle_starting_balance y
    -- monthly_income leídas/escritas en el mismo statement.
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + p_amount,
           updated_at = now()
     where family_id = v_family_id;
  elsif p_target = 'meta' then
    if not exists (select 1 from public.savings_goals where id = p_meta_goal_id and family_id = v_family_id) then
      raise exception 'meta goal does not belong to family';
    end if;
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           updated_at = now()
     where family_id = v_family_id;
    update public.savings_goals
       set current_amount = current_amount + p_amount,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_family_id;
  end if;
end;
$$;

revoke all on function public.apply_reserve_decision(numeric, text, uuid) from public;
grant execute on function public.apply_reserve_decision(numeric, text, uuid) to authenticated;
