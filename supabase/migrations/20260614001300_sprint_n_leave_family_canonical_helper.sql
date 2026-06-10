-- supabase/migrations/20260614001300_sprint_n_leave_family_canonical_helper.sql
--
-- Sprint N · Audit #5 Adversary F3 (2026-06-14):
--   `leave_current_family` (20260507000000:87, 120) checks "other
--   active members" using raw `fm.blocked_at is null`. The canonical
--   helper `is_family_member_active(fam_id)` uses `fm.role <> 'blocked'`
--   for the same concept (see migration 20260424001858, lines 74-87).
--
--   This is the SAME divergence pattern Sprint F-DB F13 already fixed
--   for `create_family_invite` (migration 20260612001600). The two
--   predicates align in practice today (family_block_member sets both
--   columns), but any future code path that touches only one of them
--   will desync `leave_current_family` from the rest of the codebase.
--
--   Concrete worry: an admin tool that blocks a member by setting
--   `role = 'blocked'` without updating `blocked_at` would make
--   leave_current_family count that user as "active" and promote them
--   to owner when the current owner leaves — handing the family to a
--   blocked account.
--
-- Fix:
--   `is_family_member_active(fam_id)` checks `auth.uid()` against a
--   given family. It doesn't take a target user_id, so we can't use
--   it directly to ask "is THIS OTHER user active in MY family".
--   Instead, we inline the canonical predicate (`role <> 'blocked'`)
--   in the two affected queries — same source of truth as the helper,
--   no foot-gun. The comment in each query points back to F13 so
--   future maintainers understand the contract.
--
--   This mirrors the F13 fix's spirit: the canonical predicate for
--   "active member" is `role <> 'blocked'`, period. `blocked_at` is
--   an auxiliary timestamp, not the gate.
--
-- Manual test plan:
--   1. Owner leaves with 2 active members → next active member
--      promoted (oldest by created_at). Unchanged behavior.
--   2. Owner leaves with 1 active + 1 with role='blocked' but
--      blocked_at=NULL (hypothetical bug state) → NEW behavior:
--      blocked user is skipped, only the active one is considered.
--      Previously the blocked user would have been considered active.
--   3. Owner leaves with 0 other members → family deleted, unchanged.
--   4. Regular member leaves → unchanged.
--
-- Rollback (manual):
--   Replay the function body from migration 20260507000000.

-- DROP first because Postgres won't let us change the return type of an
-- existing function via CREATE OR REPLACE, and PL/pgSQL flags the
-- existing definition's table-return signature as "different" even when
-- the new signature is identical text-wise. Mirrors the same pattern
-- migration 20260507000000 used.
drop function if exists public.leave_current_family();
create or replace function public.leave_current_family()
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_caller_role text;
  v_other_active_members integer;
  v_remaining_members integer;
  v_contribution numeric(12,2);
  v_display_name text;
  v_next_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code, fm.role, fm.monthly_income_contribution
    into v_current_family_id, v_current_family_code, v_caller_role,
         v_contribution
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Capture display_name BEFORE deleting so the notification body
  -- can reference the leaving user.
  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  -- ─── Owner-alone branch ────────────────────────────────────────
  -- Sprint N · Audit #5 F3: use canonical `role <> 'blocked'`
  -- (same predicate as `is_family_member_active`) instead of raw
  -- `blocked_at is null` to avoid the F13 divergence pattern.
  select count(*) into v_other_active_members
  from public.family_members fm
  where fm.family_id = v_current_family_id
    and fm.user_id <> v_user_id
    and fm.role <> 'blocked';

  if v_caller_role = 'owner' and coalesce(v_other_active_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.push_subscriptions
    where push_subscriptions.family_id = v_current_family_id;

    delete from public.family_members
    where family_members.family_id = v_current_family_id;

    delete from public.families
    where families.id = v_current_family_id;

    update public.profiles
    set onboarding_completed_at = null
    where profiles.id = v_user_id;

    return query
      select v_current_family_id, v_current_family_code;
    return;
  end if;

  -- ─── Owner-with-others branch — promote next member ──────────
  -- Pick the oldest active non-blocked member as the new owner.
  -- Sprint N · Audit #5 F3: canonical `role <> 'blocked'` predicate.
  if v_caller_role = 'owner' then
    select fm.user_id
      into v_next_owner
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.role <> 'blocked'
    order by fm.created_at asc
    limit 1;

    if v_next_owner is not null then
      update public.family_members fm
      set role = 'owner'
      where fm.family_id = v_current_family_id
        and fm.user_id = v_next_owner;
    end if;
  end if;

  -- ─── Common cleanup for owner-with-others + regular member ────
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  -- Defensive: if somehow the family is empty after the delete
  -- (shouldn't happen on this branch since we already checked
  -- for other members above), tear it down.
  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);
    delete from public.families
    where families.id = v_current_family_id;
  else
    if coalesce(v_contribution, 0) > 0 then
      insert into public.notifications (
        family_id, kind, severity, title, body, metadata, created_by
      )
      values (
        v_current_family_id,
        'member_left',
        'warning',
        v_display_name || ' se retiró del hogar',
        'El ingreso mensual del hogar bajó en $' ||
          to_char(v_contribution, 'FM999G999G999D00') || '.',
        jsonb_build_object(
          'left_user_id', v_user_id,
          'left_display_name', v_display_name,
          'monthly_income_removed', v_contribution
        ),
        v_user_id
      );
    end if;
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  return query
    select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;

comment on function public.leave_current_family() is
  'User leaves their current family. Owner-with-others promotes the '
  'oldest active member (role <> ''blocked'', Sprint N · Audit #5 F3). '
  'Owner-alone deletes the family. Regular members just leave.';
