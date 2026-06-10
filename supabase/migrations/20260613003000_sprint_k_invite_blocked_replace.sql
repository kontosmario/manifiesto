-- supabase/migrations/20260613003000_sprint_k_invite_blocked_replace.sql
--
-- Sprint K · Red team Audit #4 finding K-1 / HIGH (2026-06-10):
--   Sprint J-Med J-Med6 (20260613002100_sprint_j_invite_noop_blocked_filter.sql)
--   added `and fm.role <> 'blocked'` to the noop-shortcut SELECT so a
--   blocked user falls through to the join logic instead of getting a
--   silent noop return. The join logic was left unchanged.
--
--   Regression introduced by the J-Med6 fix:
--     The INSERT at the end of the function uses
--       on conflict (user_id) do update
--         set monthly_income_contribution = excluded.monthly_income_contribution
--     Because `family_members` has `unique(user_id)`, the existing
--     blocked row's `family_id` and `role` SURVIVE the ON CONFLICT —
--     only `monthly_income_contribution` gets overwritten. The RPC
--     returns the new family's `v_family_id` and stamps
--     `family_invites.consumed_at = now()`, but RLS still scopes the
--     user's queries to the OLD blocked family.
--
--     Net result:
--       • UI claims "joined" — `family_id` returned from RPC
--       • Invite is permanently consumed (consumed_at set)
--       • User cannot actually see the new family's data (RLS blocked)
--       • Owner cannot re-issue the same invite to the same user
--
-- Fix (mitigation (b) from the audit):
--   Before the family_members INSERT, DELETE any prior `role='blocked'`
--   rows for the caller. The DELETE only fires on the blocked-fallthrough
--   path (legitimate joiners have no prior family_members row), so the
--   happy path is unchanged. An audit_log entry is written so the
--   blocked row removal is visible to ops (audit_log infra exists since
--   Sprint G).
--
-- Manual test plan:
--   1. Blocked user with valid invite for new family:
--        • DELETE removes the blocked row
--        • INSERT creates the new active member row
--        • RPC returns new family_id, RLS scopes to new family
--        • audit_log row 'consume_family_invite_unblock' present
--   2. Happy path (user with no family + valid code) — unchanged.
--   3. Re-tap (user already in non-blocked family) — noop, unchanged.
--   4. Blocked user with invalid code — falls through, hits real
--      throttle (5/min) and raises 'Invite code not found'; no DELETE
--      runs because the exception aborts the transaction before INSERT.

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
  v_blocked_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint J-Med · J-Med6 (2026-06-10): filter blocked memberships
  -- so a blocked user can fall through to the join path for a new
  -- family. Without the `role <> 'blocked'` filter, the noop branch
  -- silently returns the blocking family's id.
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

  -- Sprint K · Audit #4 K-1 (2026-06-10): regression fix.
  --
  -- J-Med6 lets a blocked user reach the INSERT, but the ON CONFLICT
  -- on `unique(user_id)` would only update the contribution and leave
  -- the original (blocked, OLD family_id) row in place — so the
  -- caller would silently remain RLS-scoped to the blocking family
  -- while the RPC reports success and burns the invite.
  --
  -- DELETE the stale blocked row(s) so the subsequent INSERT lands
  -- as a fresh active membership in the new family. We snapshot the
  -- old family_id first for audit_log visibility.
  select fm.family_id
    into v_blocked_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'blocked'
  limit 1;

  delete from public.family_members
  where user_id = v_user_id
    and role = 'blocked';

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

  -- Sprint K · Audit #4 K-1: ops visibility for the unblock-replace
  -- path. Only logged when a blocked row was actually removed so the
  -- happy path doesn't pollute the audit stream.
  if v_blocked_family_id is not null then
    insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
    values (
      v_user_id,
      v_family_id,
      'consume_family_invite_unblock',
      'family_members',
      v_user_id,
      jsonb_build_object(
        'prev_family_id', v_blocked_family_id,
        'new_family_id', v_family_id,
        'invite_code', upper(btrim(p_code))
      )
    );
  end if;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;

comment on function public.consume_family_invite(text, numeric) is
  'Joins the caller to a family via an invite code. Idempotent for users '
  'already in a NON-BLOCKED family (noop return, throttled 30/min). '
  'Blocked memberships are DELETED before the INSERT so a blocked user '
  'can actually move to a new family — fixes the Sprint J-Med6 '
  'regression where the ON CONFLICT preserved the old blocked '
  '(family_id, role) and RLS-scoped the user to the wrong family '
  '(Sprint K · Audit #4 K-1, 2026-06-10). Join path throttled 5/min '
  '+ 3/day. Unblock events written to audit_log.';
