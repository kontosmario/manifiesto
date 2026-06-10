-- supabase/migrations/20260613002200_sprint_j_clear_pin_failures_rate_limit.sql
--
-- Sprint J-Med · Audit #3 finding J-Med7 (2026-06-10):
--   Sprint I-DB2 (20260612004100_sprint_i_track_pin_failure_rate_limit.sql)
--   added a rate limit to `track_pin_failure` but not its counterpart
--   `clear_pin_failures`. An attacker with a valid session can alternate
--   `clear_pin_failures` / `track_pin_failure` in a tight loop to keep
--   the failure counter pinned at 1 indefinitely, defeating the entire
--   server-side lockout floor.
--
--   Even with Sprint J-Med1 dropping `track_pin_failure` to 7/min, the
--   attacker can still hammer `clear_pin_failures` independently to
--   keep the row freshly zeroed out. Worse: a legitimate user typing
--   their PIN correctly only calls clear_pin_failures once per session,
--   so anything above ~1/min from the same session is abuse.
--
-- Fix:
--   Add `perform public.check_rate_limit('clear_pin_failures', 20, 60)`
--   right after the session check. 20/min is generous (matches the
--   original `track_pin_failure` cap from I-DB2) but caps scripted
--   abuse. We don't go lower because clear_pin_failures CAN be invoked
--   legitimately during a single session in edge cases (PIN change
--   flow, biometric re-enrolment) and we want zero false positives for
--   real users.
--
-- Idempotent via `create or replace function`. Body otherwise unchanged
-- from the Sprint G-Auth3 version
-- (20260613000000_sprint_g_pin_failure_mirror.sql:110-124).
--
-- Manual test plan:
--   1. Successful verifyPin → clear_pin_failures called once → OK.
--   2. Script alternating clear/track in a tight loop → trips on call
--      21 with rate-limit P0001.
--   3. PIN change flow that touches clear_pin_failures twice in a
--      minute → still OK (well under cap).

create or replace function public.clear_pin_failures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'No session';
  end if;

  -- Sprint J-Med · J-Med7 (2026-06-10): block the
  -- clear/track ping-pong attack that would otherwise keep the
  -- server-side lockout counter pinned near zero forever.
  perform public.check_rate_limit('clear_pin_failures', 20, 60);

  delete from public.pin_failure_log where user_id = v_user;
end;
$$;

revoke all on function public.clear_pin_failures() from public;
grant execute on function public.clear_pin_failures() to authenticated;

comment on function public.clear_pin_failures() is
  'Resets the server-side PIN failure counter for the caller. Rate-limited '
  '20/min (Sprint J-Med J-Med7, 2026-06-10) to block clear/track '
  'ping-pong abuse against the lockout floor.';
