-- supabase/migrations/20260608130000_apply_reserve_multifamily_guard.sql
--
-- Code review v2 finding M4 (2026-06-08):
--
-- `apply_reserve_decision` deriva la family con
--   select fm.family_id from family_members where user_id=auth.uid()
--     and role <> 'blocked' limit 1
--
-- El `limit 1` esconde un bug silencioso si en el futuro un user
-- pertenece a >1 familia activa: drena la reserva de UNA familia
-- arbitraria (la que devuelve primero el planner), sin advertencia.
--
-- Hoy el producto es single-family-per-user (el unique constraint en
-- family_members.user_id lo refuerza), así que esto es teórico. Pero
-- cuando se introduzca multi-family soporte, esta RPC tiene que
-- aceptar `p_family_id` explícito. El guard fail-loud abajo asegura
-- que la regresión sea RUIDOSA (raise exception) en lugar de
-- silenciosa (reserva drenada en la family equivocada).
--
-- Cuando se introduzca multi-family, este fix se reemplaza con un
-- parameter `p_family_id uuid` y validación de membership; el guard
-- queda como red de seguridad temporal.

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
  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  -- M4 guard: si el user pertenece a >1 familia activa, fallar
  -- explícitamente. Hoy es imposible (unique constraint en
  -- family_members.user_id) pero documentar la asunción evita un
  -- bug silencioso si esa constraint se relaja en el futuro.
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
    -- Atomic: decrement reserva + bump cycle balance EN un solo
    -- UPDATE. WHERE guard exige que la reserva pueda cubrir p_amount;
    -- si no, row_count = 0 y el RAISE comunica el detalle. (Ver
    -- migration 20260608040000 para el deep-dive del race.)
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
