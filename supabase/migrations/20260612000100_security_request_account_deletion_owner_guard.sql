-- supabase/migrations/20260612000100_security_request_account_deletion_owner_guard.sql
--
-- Sprint E · Red team finding C4 (2026-06-10):
--   The V2 idempotent rewrite of `request_account_deletion`
--   (20260609000000) silently dropped the V1 guard that prevented
--   an owner of a multi-member family from scheduling their own
--   deletion without first transferring ownership.
--
--   Result: owner schedules deletion → 30 days later cron hard-deletes
--   `auth.users` row → cascades wipe `profiles` and `family_members`
--   for the owner → the family loses its owner permanently while the
--   other active members keep their memberships orphaned.
--
-- Fix (V3):
--   Re-add the owner-of-multi-member-family check, placed BEFORE the
--   idempotency shortcut so that even if a schedule already exists
--   (e.g. from the V2 window between 2026-06-09 and now) we re-validate
--   and raise instead of silently confirming the schedule.
--
--   "Active member" matches the rest of the codebase: `role <> 'blocked'`.
--   Owner-self is excluded from the count.
--
-- Manual test plan (run after apply):
--   1. As an owner of a 2-member family → `select request_account_deletion()`
--      raises with the transfer-ownership error.
--   2. As a sole-owner family (no other members) → succeeds and schedules.
--   3. As a non-owner member → succeeds and schedules.
--   4. As an owner who already has `deletion_scheduled_at` set but who
--      gained members after V2 → re-validation re-raises (no silent
--      idempotent confirmation).

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

  -- ── Owner-of-multi-member guard (C4) ────────────────────────────
  -- Runs BEFORE the idempotency shortcut so a previously-scheduled
  -- owner whose family later grew cannot bypass this check.
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

  -- ── Idempotency (V2 behaviour, preserved) ───────────────────────
  -- If a schedule already exists, return the existing timestamp
  -- without extending the window. Retries / double-tap are safe.
  select deletion_scheduled_at
    into v_existing
    from public.profiles
   where id = v_user_id;

  if v_existing is not null then
    return v_existing;
  end if;

  -- ── First call — schedule deletion ──────────────────────────────
  v_scheduled := now() + interval '30 days';

  update public.profiles
     set deletion_scheduled_at = v_scheduled,
         updated_at = now()
   where id = v_user_id;

  -- Drop push subscriptions immediately so the user does not receive
  -- notifications during the grace period.
  delete from public.push_subscriptions
   where user_id = v_user_id;

  return v_scheduled;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'Idempotent: schedules account deletion for now()+30d. Re-validates '
  'the owner-of-multi-member-family guard on every call (Sprint E C4, '
  '2026-06-10) — an owner with other active members must transfer '
  'ownership first. Returns existing timestamp if already scheduled.';
