-- supabase/migrations/20260614004000_sprint_q_stagger_cron_schedules.sql
--
-- Sprint Q · Audit #10 Q-2 (2026-06-10):
--   Three cron jobs in 20260423220137_notifications_cron.sql all fire
--   at the same minute mark `0 12 * * *`:
--
--     * morning-checkins  — daily 12:00 UTC
--     * fixed-upcoming    — daily 12:00 UTC
--     * weekly-insights   — Mondays 12:00 UTC
--
--   On Monday at 12:00 UTC, the cron worker dispatches three
--   orchestrator calls simultaneously. The service-role batch path
--   currently bypasses the per-family rate-limit bucket, so today
--   nothing user-visible breaks — but the contention surface is real:
--     - Same-second writes to `audit_log` / orchestrator log tables.
--     - Future per-family budgets (if we ever add them) would have
--       three concurrent debits hitting the same bucket and racing
--       for the lock.
--     - Postgres-side log readability: three jobs starting at the
--       same instant interleave their notice/log output.
--
-- Strategy:
--   Stagger the two non-anchor jobs by +5min and +10min. This keeps
--   the user-facing semantics identical (still a "12 UTC" morning
--   batch from the user's POV — 5/10 minute lateness is invisible in
--   a daily notification) while serializing the orchestrator calls.
--
-- Manual test plan:
--   1. `select jobname, schedule from cron.job order by jobname;` should
--      show morning-checkins=`0 12 * * *`, fixed-upcoming=`5 12 * * *`,
--      weekly-insights=`10 12 * * 1`.
--   2. Monday 12:00–12:11 UTC the three jobs fire 5 minutes apart;
--      verify in cron.job_run_details.
--   3. Re-running this migration is a no-op (unschedule wrapped in
--      `begin ... exception when others then null`).

do $$
declare
  v_has_cron boolean;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping reschedule.';
    return;
  end if;

  -- Unschedule the three jobs we're about to re-create. Wrapped in
  -- per-statement exception handlers so the migration stays idempotent
  -- if any of the names doesn't exist (e.g. running on a fresh DB that
  -- never had the original migration applied).
  begin
    perform cron.unschedule('morning-checkins');
  exception when others then null;
  end;

  begin
    perform cron.unschedule('fixed-upcoming');
  exception when others then null;
  end;

  begin
    perform cron.unschedule('weekly-insights');
  exception when others then null;
  end;

  -- morning-checkins keeps 12:00 UTC as the anchor — it's the most
  -- user-visible job (the daily nudge); shifting it would move every
  -- user's morning notification.
  perform cron.schedule('morning-checkins', '0 12 * * *', $cron$select public.cron_emit_morning_checkins();$cron$);

  -- fixed-upcoming +5min. This one reads commitments and decides which
  -- to notify; 5 minutes lateness is undetectable from a user POV.
  perform cron.schedule('fixed-upcoming',   '5 12 * * *', $cron$select public.cron_emit_fixed_upcoming();$cron$);

  -- weekly-insights +10min. Runs Mondays only; the 10-minute offset
  -- gives morning-checkins + fixed-upcoming both time to land before
  -- this heavier aggregation kicks in.
  perform cron.schedule('weekly-insights',  '10 12 * * 1', $cron$select public.cron_emit_weekly_insights();$cron$);

exception when others then
  raise notice 'pg_cron reschedule failed: %', sqlerrm;
end;
$$;
