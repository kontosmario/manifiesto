-- Re-close the demo account's monthly rollups using proper half-open
-- cycle boundaries. The original seed (`20260427190000`) computed
-- `period_end` as the **last day** of the previous calendar month
-- (`date_trunc('month', today)::date - 1`), but `close_monthly_cycle`
-- filters with `created_at < p_period_end::timestamptz` — so any
-- expense booked on that last day was silently excluded from the
-- rollup totals.
--
-- Production never had this bug because `try_close_previous_cycle`
-- always passes the **next pay-date** as `period_end` (half-open
-- `[start, next_pay_date)`). This migration aligns the demo's seed
-- summaries with the same convention so both Febrero and Marzo
-- include their full last day.
--
-- Force-rewrites the existing summaries (idempotent).

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_today date := current_date;
  -- Half-open boundaries — match what `try_close_previous_cycle`
  -- writes for a user with `salary_payment_day = 1`.
  v_two_back_start date := date_trunc('month', v_today - interval '2 months')::date;
  v_prev_start date := date_trunc('month', v_today - interval '1 month')::date;
  v_current_start date := date_trunc('month', v_today)::date;
  v_result jsonb;
  v_two_back_has_data boolean;
begin
  select id into v_user_id
  from auth.users
  where email = 'control.demo@manifiesto.app';
  if v_user_id is null then
    raise notice 'Demo user not found, skipping recompute.';
    return;
  end if;

  select family_id into v_family_id
  from public.family_members
  where user_id = v_user_id
  limit 1;
  if v_family_id is null then
    raise notice 'Demo family not found, skipping recompute.';
    return;
  end if;

  -- Two-back cycle. period_end is now `prev_start`, not
  -- `prev_start - 1`, so the last day of the cycle gets included.
  select exists (
    select 1
    from public.expenses
    where family_id = v_family_id
      and (created_at at time zone 'America/Argentina/Buenos_Aires')::date
          between v_two_back_start and v_prev_start - 1
  ) into v_two_back_has_data;
  if v_two_back_has_data then
    v_result := public.close_monthly_cycle(
      v_family_id, v_two_back_start, v_prev_start, true
    );
    raise notice 'Recomputed two-back cycle (% to %): %',
      v_two_back_start, v_prev_start, v_result;
  end if;

  -- Previous cycle.
  v_result := public.close_monthly_cycle(
    v_family_id, v_prev_start, v_current_start, true
  );
  raise notice 'Recomputed previous cycle (% to %): %',
    v_prev_start, v_current_start, v_result;
end $$;
