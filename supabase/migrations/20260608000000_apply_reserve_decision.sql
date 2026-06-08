-- supabase/migrations/20260608000000_apply_reserve_decision.sql
--
-- RPC `apply_reserve_decision` — administra la `monthly_reserve_amount`
-- acumulada en family_finance. La reserva se llena cuando el user elige
-- "Guardar como reserva" al cerrar un mes (Spec B). Hasta acá era
-- visible (chip Home + sección Settings) pero inerte. Este RPC permite
-- moverla — total o parcial — a:
--
--   · `cycle`: suma al `current_cycle_starting_balance` del mes en curso,
--     reusando el mismo idiom que la decisión "acumular" del month-close
--     (ver 20260607230000_fix_acumular_preserves_salary.sql): cuando el
--     balance es null, coalesce con `monthly_income` para no perder el
--     sueldo configurado del cycle.
--   · `meta`: aporta al `current_amount` de una `savings_goal` activa de
--     la familia, validando ownership.
--
-- En ambos casos la reserva se descuenta atómicamente. Validación de
-- monto > 0, <= reserva disponible, family ownership.

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
  v_reserve numeric;
  v_current_balance numeric;
  v_monthly_income numeric;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  if p_target not in ('cycle', 'meta') then
    raise exception 'invalid target';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  if p_target = 'meta' and p_meta_goal_id is null then
    raise exception 'meta requires meta_goal_id';
  end if;

  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;

  if v_family_id is null then
    raise exception 'No family';
  end if;

  select monthly_reserve_amount, current_cycle_starting_balance, monthly_income
    into v_reserve, v_current_balance, v_monthly_income
    from public.family_finance
   where family_id = v_family_id;

  if coalesce(v_reserve, 0) < p_amount then
    raise exception 'amount exceeds reserve';
  end if;

  if p_target = 'cycle' then
    -- Mismo idiom que apply_month_close_decision (decisión "acumular"):
    -- preservar el income del cycle cuando el user no overrideó balance.
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance =
             coalesce(v_current_balance, coalesce(v_monthly_income, 0)) + p_amount,
           updated_at = now()
     where family_id = v_family_id;
  elsif p_target = 'meta' then
    if not exists (
      select 1 from public.savings_goals
       where id = p_meta_goal_id and family_id = v_family_id
    ) then
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
