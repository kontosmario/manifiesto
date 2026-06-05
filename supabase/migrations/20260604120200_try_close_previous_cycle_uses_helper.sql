-- supabase/migrations/20260604120200_try_close_previous_cycle_uses_helper.sql
--
-- Refactor: try_close_previous_cycle() uses compute_pay_cycle() helper
-- for both the current and previous cycle windows. Soporta los 4 tipos
-- de ciclo (monthly/biweekly/weekly/custom). Para cycle_type='monthly'
-- (default de todas las familias existentes) la lógica es idéntica al
-- previo: el helper aplica la misma "go one month back" + first-of-month
-- minus one day para derivar el inicio del ciclo previo correctamente
-- para cualquier salary_payment_day.
--
-- Cambios respecto a 20260529120000_fix_try_close_previous_cycle_month_step.sql:
--   1) Lectura de family_finance incluye las 3 columnas nuevas del ciclo.
--   2) Bloque inline de cycle calc (current + previous) reemplazado por
--      dos llamadas a public.compute_pay_cycle(...): una con current_date,
--      otra con (v_current_start - 1 day) para obtener el ciclo previo.
--   3) Resto del body idéntico (mismo return type jsonb, misma llamada a
--      close_monthly_cycle, mismos guards).
--
-- Spec: docs/superpowers/specs/2026-06-04-cycle-configurable-design.md

CREATE OR REPLACE FUNCTION public.try_close_previous_cycle(p_family_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_finance record;
  v_pay int;
  v_cycle_type text;
  v_cycle_anchor_date date;
  v_cycle_length_days smallint;
  v_today date := current_date;
  v_current_start date;
  v_current_end date;
  v_prev_start date;
  v_prev_end date;
  v_helper_curr record;
  v_helper_prev record;
begin
  select * into v_finance from public.family_finance where family_id = p_family_id;
  if not found then
    return jsonb_build_object('status', 'no_finance_record');
  end if;

  v_pay := coalesce(v_finance.salary_payment_day, 1);
  v_cycle_type := coalesce(v_finance.cycle_type, 'monthly');
  v_cycle_anchor_date := v_finance.cycle_anchor_date;
  v_cycle_length_days := v_finance.cycle_length_days;

  -- Current cycle via helper.
  select cycle_start, cycle_end_exclusive
  into v_helper_curr
  from public.compute_pay_cycle(
    v_today,
    v_cycle_type,
    v_pay::smallint,
    v_cycle_anchor_date,
    v_cycle_length_days
  );
  v_current_start := v_helper_curr.cycle_start;
  v_current_end := v_helper_curr.cycle_end_exclusive;

  -- Previous cycle: same helper, today = (current_start - 1 day).
  -- For monthly this lands in the previous calendar month, so the helper
  -- correctly derives the previous pay date — mirroring the fix in
  -- 20260529120000_fix_try_close_previous_cycle_month_step.sql for any
  -- salary_payment_day. For biweekly/weekly/custom the helper uses the
  -- anchor + length math, which also yields the previous window.
  select cycle_start, cycle_end_exclusive
  into v_helper_prev
  from public.compute_pay_cycle(
    (v_current_start - interval '1 day')::date,
    v_cycle_type,
    v_pay::smallint,
    v_cycle_anchor_date,
    v_cycle_length_days
  );
  v_prev_start := v_helper_prev.cycle_start;
  v_prev_end := v_helper_prev.cycle_end_exclusive;

  return public.close_monthly_cycle(
    p_family_id,
    v_prev_start,
    v_current_start,
    false
  );
end;
$function$;
