-- supabase/migrations/20260614000100_sprint_m_pin_mirror_null_check.sql
--
-- Sprint M · Audit #7 finding L-4 / 7-T5 (2026-06-14) — explicit
-- `auth.uid() is null` guard on PIN mirror RPCs with the standard
-- SQLSTATE 28000 (invalid_authorization_specification).
--
-- Background:
--   The PIN failure mirror functions (track_pin_failure,
--   clear_pin_failures, get_pin_lockout) already raise on `auth.uid()
--   is null` to refuse the call from anonymous PostgREST connections.
--   They previously raised with the generic message 'No session', which:
--     • Is consumed by client code only for branching, but
--     • Doesn't surface a structured SQLSTATE that observability
--       tooling (pg-stat, Sentry breadcrumbs, future server-side
--       alerts) can group by.
--
--   The auditor wanted us to:
--     1. Re-state the guard explicitly at the top of each function (it
--        already is; this migration confirms the wording.)
--     2. Use SQLSTATE 28000 (`invalid_authorization_specification`),
--        which is the standard code for "no valid auth session" and
--        will read as a distinct category in error logs.
--
-- Fix:
--   Replace `raise exception 'No session'` with
--   `raise exception 'unauthenticated' using errcode = '28000'` in all
--   three mirror RPCs.
--
--   Bodies otherwise unchanged from the most recent prior version of
--   each function (Sprint J for track_pin_failure / clear_pin_failures,
--   Sprint G for get_pin_lockout).
--
-- Idempotent via `create or replace function`. Safe to re-run.
--
-- Manual test plan:
--   1. Call any of the three RPCs with an authenticated session →
--      behaves identically to pre-migration.
--   2. Call them with no session (anon PostgREST) → fails with
--      SQLSTATE 28000 instead of P0001/00000.
--   3. Existing rate limits on track_pin_failure (7/min) and
--      clear_pin_failures (20/min) still trigger after the new auth
--      guard, not before.

-- ─── track_pin_failure ────────────────────────────────────────────
-- Latest body: Sprint J-Med J-Med1 (2026-06-10) — 7/min rate limit.
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
  -- Sprint M · L-4 (2026-06-14): explicit auth.uid() null guard with
  -- SQLSTATE 28000 (invalid_authorization_specification). Previously
  -- raised 'No session' with the implicit P0001 code; the standard
  -- 28000 makes the "unauthenticated" path distinguishable in logs.
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

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

-- ─── clear_pin_failures ────────────────────────────────────────────
-- Latest body: Sprint J-Med J-Med7 (2026-06-10) — 20/min rate limit.
create or replace function public.clear_pin_failures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Sprint M · L-4 (2026-06-14): explicit auth.uid() null guard with
  -- SQLSTATE 28000.
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform public.check_rate_limit('clear_pin_failures', 20, 60);

  delete from public.pin_failure_log where user_id = v_user;
end;
$$;

revoke all on function public.clear_pin_failures() from public;
grant execute on function public.clear_pin_failures() to authenticated;

-- ─── get_pin_lockout ──────────────────────────────────────────────
-- Latest body: Sprint G G-Auth3 (2026-06-13) — read-only.
create or replace function public.get_pin_lockout()
returns table (failed_attempts int, locked_until_ms bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Sprint M · L-4 (2026-06-14): explicit auth.uid() null guard with
  -- SQLSTATE 28000.
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  return query
    select coalesce(p.failed_attempts, 0), coalesce(p.locked_until_ms, 0::bigint)
      from public.pin_failure_log p
      where p.user_id = v_user;
  if not found then
    return query select 0, 0::bigint;
  end if;
end;
$$;

revoke all on function public.get_pin_lockout() from public;
grant execute on function public.get_pin_lockout() to authenticated;
