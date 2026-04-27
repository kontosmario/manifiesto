-- Track whether the user has ever completed onboarding, separately
-- from the current `onboarding_completed_at` (which is mutable —
-- `leave_current_family` resets it so the user goes through the
-- wizard again).
--
-- Why a separate column?
--   The onboarding `StepFamily` surfaces "first-time" copy
--   ("Empezá una familia o sumate a una existente.") vs. "rejoin"
--   copy ("Podés empezar un hogar nuevo o sumarte a otro… Tus gastos
--   y metas viejos quedan con tu hogar anterior."). The frontend was
--   distinguishing these with a brittle heuristic (any non-empty
--   display_name = rejoin), but the `handle_new_user_profile`
--   trigger ALWAYS populates display_name on signup, so brand-new
--   users incorrectly saw the rejoin copy.
--
--   The clean signal is: did this user ever complete onboarding
--   before? `previously_onboarded` answers exactly that question and
--   never gets reset.

alter table public.profiles
add column if not exists previously_onboarded boolean not null default false;

-- Backfill: users who already have an `onboarding_completed_at`
-- timestamp must have completed once. Users whose
-- `onboarding_completed_at` is currently null but who completed in
-- the past are unrecoverable (we have no historical record); from
-- this migration on, the flag tracks correctly.
update public.profiles
set previously_onboarded = true
where onboarding_completed_at is not null
  and previously_onboarded is false;

-- Trigger: flip `previously_onboarded` to true automatically the
-- first time `onboarding_completed_at` transitions from null to a
-- timestamp. Keeps the invariant in SQL, so the JS layer doesn't
-- need to remember to set both columns. Once true, never goes back.
create or replace function public.handle_onboarding_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null then
    new.previously_onboarded := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_track_onboarding_completion on public.profiles;
create trigger profiles_track_onboarding_completion
  before update of onboarding_completed_at on public.profiles
  for each row
  execute function public.handle_onboarding_completion();

-- Update `leave_current_family` so it resets `onboarding_completed_at`
-- atomically as part of the RPC, instead of relying on the JS
-- callback (which had a race window between the leave succeeding and
-- the profile reset firing). `previously_onboarded` is intentionally
-- left untouched so the rejoin copy surfaces on the next entry.
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
  where family_id = v_current_family_id
    and user_id = v_user_id;

  delete from public.family_members
  where family_id = v_current_family_id
    and user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    delete from public.families
    where id = v_current_family_id;
  end if;

  -- Reset the onboarding gate so the user re-enters the wizard.
  -- previously_onboarded stays true (set when they originally
  -- completed) so the UI surfaces rejoin copy.
  update public.profiles
  set onboarding_completed_at = null
  where id = v_user_id;

  return query select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;
