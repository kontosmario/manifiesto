-- Fix: try_close_previous_cycle computed a zero-width period window for
-- every family whose salary_payment_day != 1.
--
-- Root cause: the previous-cycle start was derived from
-- `v_current_start - interval '1 day'`. For a pay day > 1 that lands on
-- the day before the pay date, which is STILL in the same calendar month
-- (e.g. 2026-05-20 - 1 day = 2026-05-19, month = May), so
-- `pay_date_for(year, month_of(May-19)=5, pay_day=20)` returned 2026-05-20
-- again -> v_prev_start == v_current_start -> close_monthly_cycle summed an
-- empty [start, end) window -> monthly_summaries rows with
-- total_variable_spent = 0 and expenses_count = 0. Consequence: the Control
-- "VS MES PASADO" card never activates (its guard is total_variable_spent > 0)
-- for any non-day-1 cobro. Only salary_payment_day = 1 happened to work,
-- because there subtracting one day crosses into the previous month.
--
-- Fix: derive the previous cycle start from the month BEFORE
-- v_current_start (first day of current_start's month, minus one day),
-- mirroring the logic already used to compute v_current_start in the
-- "go one month back" branch. This is correct for every pay day.

CREATE OR REPLACE FUNCTION public.try_close_previous_cycle(p_family_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_finance record;
  v_pay int;
  v_today date := current_date;
  v_ty int := extract(year from v_today)::int;
  v_tm int := extract(month from v_today)::int;
  v_pay_this date;
  v_current_start date;
  v_before_current date;
  v_prev_start date;
begin
  select * into v_finance from public.family_finance where family_id = p_family_id;
  if not found then
    return jsonb_build_object('status', 'no_finance_record');
  end if;

  v_pay := coalesce(v_finance.salary_payment_day, 1);
  v_pay_this := public.pay_date_for(v_ty, v_tm, v_pay);

  -- Current cycle start = the most recent pay date <= today.
  if v_today >= v_pay_this then
    v_current_start := v_pay_this;
  else
    -- Go one month back.
    v_before_current := make_date(v_ty, v_tm, 1) - interval '1 day';
    v_current_start := public.pay_date_for(
      extract(year from v_before_current)::int,
      extract(month from v_before_current)::int,
      v_pay
    );
  end if;

  -- Previous cycle spans [prev_start, current_start). The previous cycle
  -- start is the pay date of the month BEFORE current_start. Use the last
  -- day of the previous calendar month (first-of-current-start-month minus
  -- one day) so this is correct for any pay day, not just day 1.
  v_before_current := (
    make_date(
      extract(year from v_current_start)::int,
      extract(month from v_current_start)::int,
      1
    ) - interval '1 day'
  )::date;
  v_prev_start := public.pay_date_for(
    extract(year from v_before_current)::int,
    extract(month from v_before_current)::int,
    v_pay
  );

  return public.close_monthly_cycle(
    p_family_id,
    v_prev_start,
    v_current_start,
    false
  );
end;
$function$;
