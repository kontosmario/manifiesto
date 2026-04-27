-- Restore the owner-guard on `leave_current_family`.
--
-- The guard was originally added in 20260424190000 to prevent an
-- owner from leaving while other active members remain (which would
-- leave the family in a permanently ownerless state — owner-only
-- RLS on family_finance/savings_goals would silently reject every
-- write from the surviving members forever).
--
-- The guard was lost when 20260426162741 recreated the function to
-- reset `onboarding_completed_at`. The two follow-ups that fixed
-- the ambiguous `family_id` reference (20260426180000) and the
-- cascading category cleanup (20260426181500) also didn't carry
-- the guard. The frontend at mobile/screens/settings/settings-screen
-- already surfaces a tailored copy when it sees the
-- `owner_has_members` P0001 error, so the contract is intact —
-- just the SQL side needed to re-raise it.
--
-- This migration consolidates everything the function should do:
--   1. owner-with-members guard → P0001 'owner_has_members'
--   2. qualified column refs to avoid 42702 vs OUT params
--   3. allow_delete_categories GUC for the cascade when last
--      member leaves and the family is torn down
--   4. reset onboarding_completed_at so the user re-enters wizard

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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code, fm.role
    into v_current_family_id, v_current_family_code, v_caller_role
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Owner-guard: refuse to leave if the caller owns the family AND
  -- other active (non-blocked) members are still in it. The frontend
  -- pattern-matches on the message 'owner_has_members'.
  select count(*) into v_other_active_members
  from public.family_members fm
  where fm.family_id = v_current_family_id
    and fm.user_id <> v_user_id
    and fm.blocked_at is null;

  if v_caller_role = 'owner' and v_other_active_members > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'owner_has_members',
      hint = 'El dueño no puede salir del hogar mientras haya otros miembros. Transferí primero la propiedad o pediles que se retiren.';
  end if;

  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    -- Authorize the cascading DELETE on `public.categories` for this
    -- transaction only (see 20260424180000 prevent_categories_delete).
    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.families
    where families.id = v_current_family_id;
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
