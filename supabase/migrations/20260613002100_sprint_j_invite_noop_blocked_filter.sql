-- supabase/migrations/20260613002100_sprint_j_invite_noop_blocked_filter.sql
--
-- Sprint J-Med · Audit #3 finding J-Med6 (2026-06-10):
--   `consume_family_invite` (sprint_f_invite_rate_limit_position.sql)
--   short-circuits with a noop return when the caller already has a
--   `family_members` row, but the lookup doesn't filter out blocked
--   memberships. A user that was blocked from family A can never join
--   any new family — the noop branch silently returns family A's id
--   and the join path is unreachable.
--
-- Fix:
--   Add `and fm.role <> 'blocked'` to the noop SELECT. If the only
--   matching row is blocked, the noop branch is skipped and execution
--   falls through to the actual join logic (with its 5/min + 3/day
--   throttles intact).
--
-- Idempotent via `create or replace function`. Function body otherwise
-- unchanged from the Sprint F-DB F7 version.
--
-- Manual test plan:
--   1. User with active (non-blocked) family membership re-taps deep
--      link → noop returns existing family_id (unchanged behavior).
--   2. User with ONLY a `role='blocked'` family_members row + valid
--      invite code for a different family → joins successfully (was
--      previously stuck).
--   3. User with NO family_members rows + valid code → joins (unchanged).
--   4. User with NO family_members rows + invalid code → 5/min throttle
--      still applies (unchanged).

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

  -- Sprint J-Med · J-Med6 (2026-06-10): filter blocked memberships
  -- so a blocked user can fall through to the join path for a new
  -- family. Without the `role <> 'blocked'` filter, the noop branch
  -- silently returns the blocking family's id and the user is
  -- permanently locked out of joining any other family.
  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
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
  'already in a NON-BLOCKED family (noop return, throttled 30/min). '
  'Blocked memberships do NOT short-circuit so blocked users can join '
  'another family (Sprint J-Med J-Med6, 2026-06-10). Join path '
  'throttled 5/min + 3/day.';
