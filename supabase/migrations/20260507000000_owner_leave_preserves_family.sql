-- Owner-leave preserves family.
--
-- Before this migration, when the family owner left with other
-- members remaining the entire family was torn down — `families`
-- row deleted, all cascading data wiped (categories, expenses,
-- fijos, savings_goals, family_finance), and survivors got
-- `family_closed_by_owner_at` set so the onboarding screen showed
-- "tu hogar anterior fue cerrado por su dueño".
--
-- That UX is wrong for a multi-user family budget app: removing
-- one member (even the original creator) shouldn't nuke the
-- shared history. The new policy:
--
-- • Owner leaves with 0 other members  → family is deleted (same
--   as before; no other path makes sense — empty family with no
--   members is just garbage).
-- • Owner leaves with ≥1 other member  → next active member is
--   promoted to owner. The family record stays, the code stays,
--   all shared data (expenses, fijos, finance, goals) survives.
--   The leaving owner's `monthly_income_contribution` is dropped
--   from the cached `family_finance.monthly_income` via the
--   recompute trigger; if it was > 0, a `member_left` notification
--   is emitted (same as the regular-member path from migration
--   20260506000100).
-- • Regular member leaves              → unchanged (their
--   membership row is removed, family stays).
--
-- The "next active member" rule picks the oldest non-blocked
-- member by `created_at` so the choice is deterministic. The
-- frontend's destructive-confirm sheet stays in place — the user
-- still types-to-confirm — but the copy will need to be updated
-- separately (next commit) to reflect the new behavior.
--
-- `family_closed_by_owner_at` is no longer set by this RPC. The
-- column itself stays (existing rows with values from before this
-- migration are preserved, and the onboarding screen still reads
-- it as a one-shot legacy hint).

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
  -- No other members → tear the family down. Same as before —
  -- there's nothing left to preserve.
  select count(*) into v_other_active_members
  from public.family_members fm
  where fm.family_id = v_current_family_id
    and fm.user_id <> v_user_id
    and fm.blocked_at is null;

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
  -- Deterministic, predictable for the user, and avoids leaving the
  -- family ownerless (which would break later admin actions).
  if v_caller_role = 'owner' then
    select fm.user_id
      into v_next_owner
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.blocked_at is null
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
  -- The recompute trigger from 20260506000000 fires here and
  -- subtracts the leaving member's contribution from the cached
  -- `family_finance.monthly_income`.

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
    -- Emit `member_left` notification when the leaving user
    -- contributed income — the household total dropped.
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
