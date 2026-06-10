-- supabase/migrations/20260612004200_sprint_i_audit_log_retention_cron.sql
--
-- Sprint I-DB · Red team finding I-DB3 (2026-06-10):
--   `public.audit_log` (defined in
--   20260609040000_audit_log_invitations_devices.sql:34-58) has no
--   retention policy. Sprint G-DB1 added explicit writes from 5
--   financial RPCs (apply_reserve_decision, apply_month_close_decision,
--   record/revert_fixed_expense_payment, add_savings_contribution)
--   plus existing service-role triggers. The table grows unbounded;
--   the three indexes (user_at, family_at, action_at) will bloat over
--   time and degrade RPC latency.
--
-- Fix:
--   Add a `pg_cron` schedule to delete rows older than 365 days. 365d
--   matches the typical forensic horizon for app-level audit (longer
--   than the legal 90d incident-investigation window, shorter than
--   the 7y financial-records horizon we'd handle differently if
--   required — current audit_log is operational, not regulatory).
--   Daily run at 03:30 UTC — offset from `rpc-rate-limit-purge`
--   (03:00 UTC) so they don't pile up in the same minute.
--
--   Pattern mirrored from
--   20260609030000_rpc_rate_limit_purge_cron.sql: defensive extension
--   creation + `unschedule` before `schedule` so the migration is
--   re-runable.
--
-- Schema reference (verified against 20260609040000:34-51):
--   audit_log.at  timestamptz not null default now()
--   → predicate `at < now() - interval '365 days'` is correct.

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available on this project plan: %', sqlerrm;
end;
$$;

do $$
declare
  v_has_cron boolean;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping audit_log retention schedule.';
    return;
  end if;

  -- Re-runable: drop any previous schedule with the same name.
  begin
    perform cron.unschedule('audit-log-retention-purge');
  exception when others then null;
  end;

  -- 03:30 UTC daily. Offset from rpc-rate-limit-purge (03:00 UTC) to
  -- avoid piling jobs in the same minute. Off-peak vs. AR users (00:30).
  perform cron.schedule(
    'audit-log-retention-purge',
    '30 3 * * *',
    $cron$delete from public.audit_log where at < now() - interval '365 days';$cron$
  );
exception when others then
  raise notice 'pg_cron scheduling failed: %', sqlerrm;
end;
$$;
