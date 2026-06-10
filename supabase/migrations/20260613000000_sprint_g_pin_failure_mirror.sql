-- supabase/migrations/20260613000000_sprint_g_pin_failure_mirror.sql
--
-- Sprint G · G-Auth3 — server-side PIN failure mirror
--
-- Why:
--   The on-device PIN lockout (5 attempts → 30s/1m/2m/4m/8m exponential
--   backoff) lives entirely in SecureStore. A rooted device + an
--   attacker that can `SecureStore.deleteItemAsync('app-lock.pin.lockout')`
--   resets the counter and resumes brute-forcing. Defense-in-depth: also
--   track failures server-side, keyed by `auth.uid()`, and let the client
--   honour whichever lockout is stricter (server is the FLOOR, client is
--   the fast path).
--
--   This does NOT prevent a fully offline attacker (they can also patch
--   the client to skip the RPC), but it deters the casual jailbreak +
--   SecureStore-rewrite scenario, which is the documented threat model
--   in `mobile/lib/pin-lock.ts`.
--
-- Design:
--   • Single table `pin_failure_log` with PK `user_id` (one row per
--     user). Reuses the same sliding-window idiom as
--     `rpc_rate_limit`. We don't need full history — only the current
--     counter + lockout expiry.
--   • `track_pin_failure()` increments on every failed verifyPin and
--     returns the new counter + lockedUntil (unix ms). Client maps that
--     into the same `lockedForMs` field it computes locally and takes
--     `max(local, server)`.
--   • `clear_pin_failures()` is called after a successful verifyPin so
--     the user's lockout state matches reality.
--   • RLS deny-all; access only via SECURITY DEFINER RPCs that key on
--     `auth.uid()`.

create table if not exists public.pin_failure_log (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pin_failure_log enable row level security;

drop policy if exists pin_failure_log_no_direct_access on public.pin_failure_log;
create policy pin_failure_log_no_direct_access
  on public.pin_failure_log
  for all
  using (false)
  with check (false);

-- ─── track_pin_failure ─────────────────────────────────────────────
-- Increments the failure counter for the calling user and returns the
-- next-allowed-attempt timestamp (unix ms). Lockout schedule matches
-- the client:
--   threshold = 5, base = 30s, cap = 8min, doubling per overage.
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
-- Called after a successful verifyPin. Resets the counter so future
-- failures start from zero.
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
  delete from public.pin_failure_log where user_id = v_user;
end;
$$;

revoke all on function public.clear_pin_failures() from public;
grant execute on function public.clear_pin_failures() to authenticated;

-- ─── get_pin_lockout ───────────────────────────────────────────────
-- Read-only fetch of the server's current view of the user's lockout
-- so the client can honour it on cold start (before the first failed
-- attempt of the session).
create or replace function public.get_pin_lockout()
returns table (failed_attempts int, locked_until_ms bigint)
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
  return query
    select coalesce(p.failed_attempts, 0), coalesce(p.locked_until_ms, 0::bigint)
      from public.pin_failure_log p
      where p.user_id = v_user;
  -- If no row: return one zero row so the client doesn't see "no rows".
  if not found then
    return query select 0, 0::bigint;
  end if;
end;
$$;

revoke all on function public.get_pin_lockout() from public;
grant execute on function public.get_pin_lockout() to authenticated;
