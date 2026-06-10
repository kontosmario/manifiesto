-- supabase/migrations/20260613004000_sprint_l_invite_blocks_pending_deletion.sql
--
-- Sprint L · Audit #5 L-1 / HIGH (2026-06-10):
--   Composition bug between owner-deletion grace period and family
--   invite lifecycle.
--
--   Repro (orphan-family race):
--     1. Owner of a sole-owner family calls request_account_deletion()
--        → V3 owner guard passes (no other active members) → schedules
--        deletion 30 days out. Push subscriptions are dropped, but
--        family_members row + family row remain.
--     2. Same owner, day 5: calls create_family_invite() → succeeds
--        (no deletion check) → mints an 8-char code.
--     3. Outsider, day 6: consume_family_invite(code) → succeeds
--        (no deletion check) → joins family as 'member'.
--     4. Day 30: cron_delete_pending_accounts hard-deletes auth.users
--        row for the owner → FK cascades wipe the owner's
--        family_members row → the family now has zero owners but
--        retains the joined member, orphaned. RLS scopes that user
--        to a half-broken family with no owner-driven RPCs (invite,
--        transfer, finance writes) possible.
--
--   Net effect: silent orphan family + invite that consumed grace-
--   period trust the owner no longer has.
--
-- Fix:
--   • consume_family_invite: before consuming, verify the target
--     family's owner is not pending deletion. The joiner gets a
--     generic 'Invite no longer valid' error so we don't leak
--     whether the family exists vs whose owner is leaving.
--   • create_family_invite: at the function entry (post-auth check),
--     verify the caller does not have deletion_scheduled_at set.
--     A leaving owner cannot generate new invites.
--   • request_account_deletion (V4): when the sole-owner path
--     actually schedules deletion, also DELETE any of the caller's
--     unused family_invites so existing codes can't be redeemed
--     during the grace period.
--
-- Manual test plan:
--   1. Owner schedules deletion → create_family_invite() raises
--      'invite-disabled-account-pending-deletion'.
--   2. Existing unused invite from before scheduling → DELETED by
--      V4 inside request_account_deletion.
--   3. New user tries consume_family_invite with a (hypothetically
--      surviving) code → generic 'Invite no longer valid' error.
--   4. Owner cancels deletion (separate RPC) → can mint and consume
--      invites again. We do NOT need to "undo" the deleted invites
--      from step 2: a new code is one tap away. Better than the
--      alternative of resurrecting them.
--   5. Non-owner member with deletion_scheduled_at: irrelevant for
--      L-1 — they have no invite-mint power and don't orphan the
--      family. We do NOT block their invite consumption (joining a
--      different family while their own account is leaving is not
--      a meaningful surface).
--
-- Idempotency: `create or replace function` on both RPCs; the
-- DELETE in request_account_deletion is on an indexed predicate
-- and tolerant of empty result sets.

-- ─── 1. consume_family_invite — block if family owner is leaving ──
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

  -- Sprint L · Audit #5 L-1 (2026-06-10): block consumption if the
  -- target family's owner is in the deletion grace period. Without
  -- this check a joiner can land in a family whose owner gets
  -- hard-deleted in <30 days, leaving them orphaned in a family
  -- with no owner-driven RPC access.
  --
  -- We use a generic 'Invite no longer valid' message that does not
  -- distinguish "owner leaving" from other invalid states — an
  -- outsider redeeming a leaked code does not need to learn that
  -- the family owner is leaving (privacy + minimal-disclosure).
  if exists (
    select 1
      from public.profiles p
      join public.family_members fm on fm.user_id = p.id
     where fm.family_id = v_family_id
       and fm.role = 'owner'
       and p.deletion_scheduled_at is not null
  ) then
    raise exception 'Invite no longer valid' using errcode = 'P0001';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  -- Sprint K · Audit #4 K-1 (2026-06-10): regression fix — delete
  -- prior blocked rows so the INSERT lands in the new family. See
  -- 20260613003000_sprint_k_invite_blocked_replace.sql for the full
  -- rationale; logic preserved verbatim.
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
  'Sprint L · Audit #5 L-1 (2026-06-10): refuses consumption if the '
  'target family''s owner has deletion_scheduled_at set — prevents the '
  'orphan-family race where a member joins during the 30-day grace '
  'period. Generic ''Invite no longer valid'' error to avoid leaking '
  'the owner''s deletion status. Other behaviour unchanged from K-1.';

-- ─── 2. create_family_invite — block if caller is leaving ─────────
create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
  v_pending_deletion timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint L · Audit #5 L-1 (2026-06-10): an owner with a pending
  -- account deletion must not be able to mint new invites — every
  -- code they generate is a trap (the redeemer would be orphaned
  -- in <30 days). Check before the rate-limit so abusive callers
  -- can't even consume the rate-limit bucket.
  select p.deletion_scheduled_at into v_pending_deletion
    from public.profiles p
   where p.id = v_user_id;

  if v_pending_deletion is not null then
    raise exception 'No podés generar invitaciones mientras tu cuenta tenga una baja agendada. Cancelá la baja primero.'
      using errcode = 'P0001';
  end if;

  -- Sprint I-DB I-DB4 (2026-06-10): rate limit to prevent abusive
  -- bulk-mint of invite codes. 10/hour suffices for normal onboarding.
  perform public.check_rate_limit('create_family_invite', 10, 3600);

  -- Sprint F-DB F13: canonical active-member helper.
  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not currently in a family';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
      return next;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 8 then
        raise exception 'Could not generate a unique invite code.';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;

comment on function public.create_family_invite() is
  'Generates a single-use family invite code. Uses canonical '
  'is_family_member_active helper for blocked-member filtering '
  '(Sprint F-DB F13). Rate-limited 10/hour (Sprint I-DB I-DB4). '
  'Sprint L · Audit #5 L-1 (2026-06-10): refuses if the caller has '
  'deletion_scheduled_at set, to prevent the orphan-family race.';

-- ─── 3. request_account_deletion V4 — invalidate own invites ──────
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_other_active int;
  v_existing timestamptz;
  v_scheduled timestamptz;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Owner-of-multi-member guard (Sprint E C4) — preserved.
  select fm.family_id into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role = 'owner'
     and fm.blocked_at is null
   limit 1;

  if v_family_id is not null then
    select count(*) into v_other_active
      from public.family_members
     where family_id = v_family_id
       and user_id <> v_user_id
       and role <> 'blocked';

    if v_other_active > 0 then
      raise exception
        'Sos dueño de una familia con otros miembros. Transferí ownership antes de borrar tu cuenta.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Idempotency (V2). Note we re-run the L-1 invite invalidation
  -- below on the first-schedule path only; if a schedule already
  -- exists we trust V3's prior run to have invalidated whatever
  -- invites existed at that point AND the create_family_invite
  -- guard above to have prevented any new ones since.
  select deletion_scheduled_at
    into v_existing
    from public.profiles
   where id = v_user_id;

  if v_existing is not null then
    return v_existing;
  end if;

  v_scheduled := now() + interval '30 days';

  update public.profiles
     set deletion_scheduled_at = v_scheduled,
         updated_at = now()
   where id = v_user_id;

  -- Drop push subscriptions immediately.
  delete from public.push_subscriptions
   where user_id = v_user_id;

  -- Sprint L · Audit #5 L-1 (2026-06-10): invalidate the caller's
  -- pending family invites so an outsider can't redeem a code minted
  -- before this point and end up orphaned post-hard-delete. Only
  -- touches `consumed_at is null` rows — already-consumed invites
  -- represent real memberships that should not be retroactively
  -- erased (the joined member is unaffected by this DELETE; their
  -- family_members row remains valid for the 30-day grace period,
  -- giving them time to react if the owner is leaving).
  delete from public.family_invites
   where created_by = v_user_id
     and consumed_at is null;

  return v_scheduled;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'V4 (Sprint L · Audit #5 L-1, 2026-06-10): on top of V3''s owner-of-'
  'multi-member guard (Sprint E C4) and push-subscription scrub, also '
  'DELETEs the caller''s unused family_invites so the 30-day grace '
  'window cannot grow new orphans. Idempotent: returns existing '
  'timestamp without re-running side effects if already scheduled.';
