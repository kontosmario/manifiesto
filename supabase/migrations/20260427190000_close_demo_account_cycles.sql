-- One-shot: close the previous two cycles for the control demo
-- account so the "vs mes pasado" Control card has a real summary
-- to compare against. The seed migration loaded ~60 days of
-- variable expenses but never wrote `monthly_summaries` rows; this
-- migration calls `close_monthly_cycle` (which is the same RPC the
-- production rollup cron uses) to produce them now.
--
-- Idempotent: if no demo user, no demo family, or the summaries
-- already exist, the script no-ops.

do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_today date := current_date;
  v_two_back_start date := date_trunc('month', v_today - interval '2 months')::date;
  v_two_back_end date := (date_trunc('month', v_today - interval '1 month')::date) - 1;
  v_prev_start date := date_trunc('month', v_today - interval '1 month')::date;
  v_prev_end date := (date_trunc('month', v_today)::date) - 1;
  v_result jsonb;
  v_two_back_has_data boolean;
begin
  select id into v_user_id
  from auth.users
  where email = 'control.demo@manifiesto.app';
  if v_user_id is null then
    raise notice 'Demo user not found, skipping cycle close.';
    return;
  end if;

  select family_id into v_family_id
  from public.family_members
  where user_id = v_user_id
  limit 1;
  if v_family_id is null then
    raise notice 'Demo family not found, skipping cycle close.';
    return;
  end if;

  -- Close oldest cycle first so the previous-month summary's
  -- `delta_vs_previous_percent` has a baseline to compare against.
  -- Skip if there are no expenses landing in that window — the seed
  -- inserted 60 days, so depending on when "today" is, the
  -- two-back cycle may be empty.
  select exists (
    select 1
    from public.expenses
    where family_id = v_family_id
      and (created_at at time zone 'America/Argentina/Buenos_Aires')::date
          between v_two_back_start and v_two_back_end
  ) into v_two_back_has_data;

  if v_two_back_has_data then
    v_result := public.close_monthly_cycle(
      v_family_id, v_two_back_start, v_two_back_end, true
    );
    raise notice 'Closed two-back cycle (% to %): %', v_two_back_start, v_two_back_end, v_result;
  end if;

  -- Always close the immediate previous cycle — the seed guarantees
  -- it has variable expenses (last 30 days are most populated).
  v_result := public.close_monthly_cycle(
    v_family_id, v_prev_start, v_prev_end, true
  );
  raise notice 'Closed previous cycle (% to %): %', v_prev_start, v_prev_end, v_result;
end $$;
