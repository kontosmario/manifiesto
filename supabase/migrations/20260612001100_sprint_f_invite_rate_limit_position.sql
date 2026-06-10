-- supabase/migrations/20260612001100_sprint_f_invite_rate_limit_position.sql
--
-- Sprint F-DB · Red team finding F7 (2026-06-10):
--   `consume_family_invite` (sprint_b_cr_hardening V4) runs the
--   "user already in a family → noop return" idempotent shortcut
--   BEFORE `enforce_rate_limit` / `check_rate_limit`. An attacker
--   already in a family can call the RPC in a loop with arbitrary
--   `p_code` values without ever burning rate-limit quota — the
--   shortcut bails out before the throttle.
--
--   While the no-op path doesn't leak invite validity (it never
--   touches `family_invites`), it still consumes server CPU and
--   masks abuse signals (rate-limit metrics on this RPC would
--   never trip).
--
-- Fix:
--   Add a cheap separate throttle for the no-op path
--   (30/min — generous enough that legitimate deep-link re-taps
--   don't trip, tight enough to make scripted abuse expensive).
--   Keep the real throttles (5/min + 3/day) in their current
--   position so a user without family can't brute-force codes
--   via 30 attempts/min through the noop window.
--
-- Manual test plan:
--   1. User with family re-taps deep link 5 times → succeeds (noop).
--   2. User with family scripts 60 calls/min → trips on call 31
--      with 'rate limit exceeded'.
--   3. User without family with valid code → succeeds, family joined.
--   4. User without family with invalid code → still trips real
--      throttle after 5 attempts (unchanged from V4).

create or replace function public.consume_family_invite(
  p_code text,
  p_contribution numeric default null
)
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_existing_family_id uuid;
  v_contribution numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint F-DB F7 (2026-06-10): noop-path throttle. Without this,
  -- a user already in a family can spam this RPC with arbitrary codes
  -- and never trip the real `consume_family_invite` rate limit. 30/min
  -- is generous for legitimate re-taps but expensive for scripted
  -- abuse.
  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    perform public.enforce_rate_limit('consume_family_invite_noop', 30, 60);
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  -- Real throttles for the join path: 5/min (anti-bruteforce) + 3/day.
  perform public.enforce_rate_limit('consume_family_invite', 5, 60);
  perform public.check_rate_limit('consume_family_invite', 3, 86400);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  for update;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;

  update public.family_invites
  set consumed_by = v_user_id,
      consumed_at = now()
  where family_invites.code = upper(btrim(p_code));

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;

comment on function public.consume_family_invite(text, numeric) is
  'Joins the caller to a family via an invite code. Idempotent for users '
  'already in a family (noop return, throttled 30/min — Sprint F-DB F7, '
  '2026-06-10). Join path throttled 5/min + 3/day.';
