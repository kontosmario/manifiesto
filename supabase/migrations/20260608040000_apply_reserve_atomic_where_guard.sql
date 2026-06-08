-- supabase/migrations/20260608040000_apply_reserve_atomic_where_guard.sql
--
-- Code review v2 finding M4 (2026-06-08):
--
-- `apply_reserve_decision` validaba con SELECT-then-UPDATE:
--
--   select monthly_reserve_amount into v_current_reserve …
--   if coalesce(v_current_reserve, 0) < p_amount then raise …
--   update family_finance set monthly_reserve_amount = … - p_amount
--
-- Race: dos applies concurrentes con p_amount == reserva total pasan
-- ambos la guarda → el UPDATE doble deja monthly_reserve_amount en
-- valor negativo. Hoy es teórico (single device por user), pero la
-- regresión silenciosa al introducir multi-device sería seria.
--
-- Fix: validación + decrement en un solo UPDATE con WHERE guard que
-- exige reserva suficiente. Si el UPDATE matchea 0 rows, el RAISE
-- explícito comunica el motivo al cliente. Atómico bajo MVCC: dos
-- transacciones simultáneas no pueden ambos leer "10" y restar "10";
-- la segunda transaction ve el resultado de la primera al re-evaluar
-- el WHERE.

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
  v_updated int;
begin
  if v_user_id is null then raise exception 'No session'; end if;
  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;
  if v_family_id is null then raise exception 'No family'; end if;

  if p_target = 'cycle' then
    -- Atomic: decrement reserva + bump cycle balance EN un solo
    -- UPDATE. WHERE guard exige que la reserva pueda cubrir p_amount;
    -- si no, row_count = 0 y el RAISE comunica el detalle.
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
