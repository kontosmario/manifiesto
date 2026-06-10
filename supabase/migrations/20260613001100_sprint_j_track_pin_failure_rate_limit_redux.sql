-- supabase/migrations/20260613001100_sprint_j_track_pin_failure_rate_limit_redux.sql
--
-- Sprint J · Red team Audit #3 finding J-DB2 (2026-06-10):
--   Migration order race between Sprint I and Sprint G.
--
--   • `20260612004100_sprint_i_track_pin_failure_rate_limit.sql` adds a
--     20/min `check_rate_limit('track_pin_failure', 20, 60)` guard
--     INSIDE the function body via `create or replace function`.
--
--   • `20260613000000_sprint_g_pin_failure_mirror.sql` CREATES the same
--     `track_pin_failure` function (this is the original G-Auth3 file).
--     Its file timestamp (20260613) is AFTER the Sprint I file timestamp
--     (20260612), so on a FRESH `db push --include-all`:
--       1. Sprint I runs first → rate limit added.
--       2. Sprint G runs second → `create or replace function` clobbers
--          the function body and DROPS the rate limit.
--
--   Production today is fine (migrations were applied in historical
--   order), but any rebuild — staging, fork, CI smoke, restore from
--   plain SQL dump — lands without the I-DB2 hardening.
--
-- Fix:
--   Restore Sprint I-DB2 hardening AFTER Sprint G via this new
--   migration. Whatever order `db push` chooses, this file's timestamp
--   (20260613001100) is the latest to touch `track_pin_failure`, so it
--   wins. The function body is preserved verbatim from Sprint I-DB2
--   plus this `create or replace`.
--
--   Sprint I-DB2 rationale (preserved for context):
--     `track_pin_failure` has no rate limit. An attacker with a stolen
--     session token (or a malicious foreground component) can call it
--     in a tight loop and immediately push the legitimate user into the
--     server-side lockout floor (5 attempts → 8-minute backoff cap).
--     The mobile client honors `max(local, server)`, so server-side
--     poisoning takes effect on the next foreground.
--
--     Threat is LOW probability (requires a valid session) but the
--     user-visible impact is bad: legitimate user is locked out of
--     their own PIN. Defense-in-depth: cap the RPC at 20/min — well
--     above the "user is fumbling PIN" rate (5 attempts before backoff
--     kicks in) but blocks scripted abuse.

create or replace function public.track_pin_failure()
returns table (failed_attempts int, locked_until_ms bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_threshold constant int := 5;
  v_base_ms constant bigint := 30000;
  v_cap_ms constant bigint := 8 * 60 * 1000;
  v_next_failed int;
  v_overage int;
  v_dur_ms bigint;
  v_locked_until bigint;
begin
  if v_user is null then
    raise exception 'No session';
  end if;

  -- Sprint I-DB I-DB2 (2026-06-10) RE-APPLIED in Sprint J (Audit #3
  -- J-DB2, 2026-06-10): rate limit to block scripted abuse of the
  -- server-side lockout (DoS against the legitimate user via their own
  -- stolen session). 20/min is generous vs. the ~5 attempts before
  -- backoff kicks in. This guard was clobbered on fresh `db push` by
  -- Sprint G-Auth3 migration order race; re-applying here so the
  -- latest migration to touch the function (this one) keeps the guard.
  perform public.check_rate_limit('track_pin_failure', 20, 60);

  insert into public.pin_failure_log (user_id, failed_attempts, locked_until_ms, updated_at)
  values (v_user, 1, 0, now())
  on conflict (user_id)
  do update set
    failed_attempts = public.pin_failure_log.failed_attempts + 1,
    updated_at = now()
  returning public.pin_failure_log.failed_attempts into v_next_failed;

  v_overage := v_next_failed - v_threshold;
  if v_overage < 0 then
    v_dur_ms := 0;
  else
    v_dur_ms := least(v_base_ms * (2 ^ v_overage)::bigint, v_cap_ms);
  end if;

  if v_dur_ms > 0 then
    v_locked_until := v_now_ms + v_dur_ms;
  else
    v_locked_until := 0;
  end if;

  update public.pin_failure_log
    set locked_until_ms = v_locked_until
    where user_id = v_user;

  return query select v_next_failed, v_locked_until;
end;
$$;

revoke all on function public.track_pin_failure() from public;
grant execute on function public.track_pin_failure() to authenticated;

comment on function public.track_pin_failure() is
  'Server-side mirror of the on-device PIN failure counter. Rate-limited '
  '20/min (Sprint I-DB I-DB2, re-applied in Sprint J · Audit #3 J-DB2 '
  '2026-06-10 to defeat migration-order race) to block scripted lockout '
  'poisoning via stolen session tokens.';
