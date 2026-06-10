-- supabase/migrations/20260613002000_sprint_j_lower_pin_failure_rate_limit.sql
--
-- Sprint J-Med · Audit #3 finding J-Med1 (2026-06-10):
--   `track_pin_failure` was rate-limited to 20/min by Sprint I-DB2
--   (20260612004100_sprint_i_track_pin_failure_rate_limit.sql). That
--   cap is too generous for the actual threat: lockout poisoning only
--   needs 9 consecutive increments to drive the legitimate user to the
--   floor lockout cap (5 failed attempts crosses the threshold; the
--   next 4 increments take the exponential backoff from 30s → 1m →
--   2m → 4m → 8m, hitting the 8-minute hard cap). 20/min lets the
--   attacker complete the full poisoning in <30 seconds.
--
-- Why 7/min:
--   • Floor poisoning requires 9 increments. 7/min means an attacker
--     needs ≥2 minutes of continuous abuse to reach the cap — long
--     enough that ops alerting on the (already-recorded) rate-limit
--     hits has time to fire.
--   • Legitimate user typing speed: even a panicked user fat-fingering
--     a PIN rarely exceeds 3 failed attempts/min. 7/min preserves >2x
--     headroom over the worst legitimate case, including the back-and-
--     forth pattern when a user toggles between PIN and biometric.
--   • Still well below 9, so single-window poisoning is impossible.
--
-- Idempotent via `create or replace function`. Function body otherwise
-- unchanged from the Sprint I-DB2 version — only the rate limit number
-- moves.
--
-- Manual test plan:
--   1. Call track_pin_failure() 7 times in 60s → all succeed.
--   2. 8th call within window → raises rate-limit P0001.
--   3. After the 60s window resets, calls work again.
--   4. Real user typing wrong PIN 5 times → still triggers normal
--      lockout (rate limit doesn't trip).

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

  -- Sprint J-Med · J-Med1 (2026-06-10): lowered from 20/min to 7/min.
  -- Floor poisoning needs 9 increments to drive the legitimate user to
  -- the 8-minute lockout cap; 7/min makes single-window poisoning
  -- impossible while preserving >2x headroom over legitimate user
  -- typing speed (≤3 attempts/min in panic cases).
  perform public.check_rate_limit('track_pin_failure', 7, 60);

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
  '7/min (Sprint J-Med J-Med1, 2026-06-10) — below the 9 increments '
  'needed for full lockout poisoning while preserving headroom over '
  'legitimate user typing speed.';
