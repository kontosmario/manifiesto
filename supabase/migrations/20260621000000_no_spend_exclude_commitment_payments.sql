-- No-spend day guard: excluir los pagos de FIJOS (commitment) del chequeo
-- "el día ya tiene gastos".
--
-- Bug reportado por owner: un día cuyo único "gasto" era un pago de fijo
-- (ej. Spotify/Apple debitados ese día) NO se podía marcar como "día sin
-- gastos", PERO la vista de Gastos no muestra los pagos de fijos → el día
-- se veía vacío y el rechazo parecía un bug ("EXPENSES_EXIST_ON_DATE" en un
-- día visualmente vacío).
--
-- Semántica correcta: un "día sin gastos" es un día sin gasto DISCRECIONAL.
-- Pagar un fijo automático (suscripción, débito recurrente) no es un gasto
-- discrecional y no debería bloquear el no-spend. Ahora solo los gastos
-- variables (commitment_id is null) cuentan.
--
-- Único cambio vs 20260601005000: el `and e.commitment_id is null` en el
-- query de v_has_expenses. Resto idéntico. Firma sin cambios → CREATE OR
-- REPLACE (sin drop). Se re-aplica el grant por las dudas (idempotente).

create or replace function public.mark_no_expense_day(
  p_family_id uuid,
  p_date date default null,
  p_force boolean default false
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_target date;
  v_has_expenses boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;
  v_target := coalesce(p_date, v_today);

  -- Future dates are nonsensical: you can't claim "no spend" for a
  -- day that hasn't happened yet.
  if v_target > v_today then
    raise exception 'FUTURE_DATE_NOT_ALLOWED'
      using hint = 'Cannot mark a future date as no-spend.';
  end if;

  -- Solo cuentan los gastos DISCRECIONALES (variables). Los pagos de
  -- fijos (commitment_id not null) son débitos automáticos recurrentes,
  -- no un "gasto" para el streak de días sin gastar — y además no se
  -- muestran en la vista diaria de Gastos.
  select exists(
    select 1
    from public.expenses e
    where e.family_id = p_family_id
      and e.created_by = v_user_id
      and e.commitment_id is null
      and (e.created_at at time zone public.user_local_timezone(v_user_id))::date = v_target
  ) into v_has_expenses;

  if v_has_expenses then
    -- Past dates: hard reject. The past is settled.
    if v_target < v_today then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'That day already has registered expenses; it cannot be marked as no-spend.';
    end if;
    -- Today: require explicit consent (the UI shows an Alert).
    if not p_force then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'Today already has expenses; pass p_force = true to mark anyway.';
    end if;
  end if;

  insert into public.streak_marked_days (family_id, user_id, marked_date)
  values (p_family_id, v_user_id, v_target)
  on conflict (family_id, user_id, marked_date) do nothing;

  perform public.advance_streak(p_family_id, v_user_id, v_target);

  return v_target;
end;
$$;

revoke all on function public.mark_no_expense_day(uuid, date, boolean) from public;
grant execute on function public.mark_no_expense_day(uuid, date, boolean) to authenticated;
