-- When the last member leaves a family, `leave_current_family`
-- deletes the row in `public.families`, which cascades into
-- `public.categories` (FK on delete cascade). The
-- `prevent_categories_delete` trigger (migration 20260424180000)
-- then aborts the cascade with P0001 unless
-- `app.allow_delete_categories` is 'on' in the current transaction.
--
-- This is exactly the legitimate case the escape hatch was designed
-- for: the family is being torn down, so its derived category rows
-- must go with it. We opt in via `set local` so the GUC is scoped
-- to this transaction only.

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
  v_remaining_members integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
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
    -- transaction only. Scoped via `set local` so it auto-resets at
    -- COMMIT/ROLLBACK and never leaks into another statement.
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
