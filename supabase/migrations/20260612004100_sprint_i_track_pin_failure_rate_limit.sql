-- supabase/migrations/20260612004100_sprint_i_track_pin_failure_rate_limit.sql
--
-- Sprint I-DB · Red team finding I-DB2 (2026-06-10):
--   `track_pin_failure` (defined in
--   20260613000000_sprint_g_pin_failure_mirror.sql:54-102) has no
--   rate limit. An attacker with a stolen session token (or a
--   malicious foreground component) can call it in a tight loop and
--   immediately push the legitimate user into the server-side lockout
--   floor (5 attempts → 8-minute backoff cap). The mobile client
--   honors `max(local, server)`, so server-side poisoning takes
--   effect on the next foreground.
--
--   Threat is LOW probability (requires a valid session) but the
--   user-visible impact is bad: legitimate user is locked out of their
--   own PIN. Defense-in-depth: cap the RPC at 20/min — well above the
--   "user is fumbling PIN" rate (5 attempts before backoff kicks in)
--   but blocks scripted abuse.
--
-- Fix:
--   Add `perform public.check_rate_limit('track_pin_failure', 20, 60)`
--   right after the session check. The rate-limit infrastructure
--   (`check_rate_limit` from 20260609010000_rpc_rate_limit.sql) is
--   already in place; we just call it.
--
--   Idempotent via `create or replace function`. The rest of the
--   function body (insert/update of pin_failure_log + lockout math)
--   is preserved verbatim.

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

  -- Sprint I-DB I-DB2 (2026-06-10): rate limit to block scripted abuse
  -- of the server-side lockout (DoS against the legitimate user via
  -- their own stolen session). 20/min is generous vs. the ~5 attempts
  -- before backoff kicks in.
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
  '20/min (Sprint I-DB I-DB2, 2026-06-10) to block scripted lockout '
  'poisoning via stolen session tokens.';
