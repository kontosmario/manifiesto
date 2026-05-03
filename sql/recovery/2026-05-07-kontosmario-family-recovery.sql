-- Recovery script — kontosmario@gmail.com
--
-- Context: the legacy `leave_current_family` RPC (in effect through
-- migration 20260426190000) destroyed the entire family when the
-- owner left, even when other members remained. As of migration
-- 20260507000000 that's fixed (the next member is promoted to
-- owner), but accounts that ran the legacy version already lost
-- their family record + code.
--
-- This script DOES NOT auto-fix anything destructive. It only
-- INSPECTS the account so you can decide the next step:
--   1. If the account has no family at all → user can re-bootstrap
--      from the onboarding wizard. Nothing to do here.
--   2. If the account has a family but the code is somehow blank /
--      malformed → run the optional code-rotation block at the end.
--   3. If kontosmario should NOT have onboarding_completed_at set
--      (i.e. they need to re-do the wizard) → run the optional
--      reset block.
--
-- Run with the service role (psql / SQL editor in the Supabase
-- dashboard). All blocks are idempotent.

-- ─── 1. Inspect ────────────────────────────────────────────────
-- Returns one row per account; the relevant fields tell you which
-- branch to apply below. Run this first.
do $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_family_code text;
  v_role text;
  v_contribution numeric;
  v_completed_at timestamptz;
  v_closed_by_owner_at timestamptz;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower('kontosmario@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice '[recovery] auth.users entry not found for kontosmario@gmail.com';
    return;
  end if;

  select fm.family_id, f.code, fm.role, fm.monthly_income_contribution
    into v_family_id, v_family_code, v_role, v_contribution
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  select p.onboarding_completed_at, p.family_closed_by_owner_at
    into v_completed_at, v_closed_by_owner_at
  from public.profiles p
  where p.id = v_user_id;

  raise notice '[recovery] user_id=% family_id=% code=% role=% contribution=% completed_at=% closed_by_owner_at=%',
    v_user_id, v_family_id, v_family_code, v_role, v_contribution,
    v_completed_at, v_closed_by_owner_at;
end $$;


-- ─── 2. (Optional) Reset onboarding so the user can re-do it ───
-- Run only if the account is in a stuck state (e.g. profile says
-- onboarding_completed_at is set but there's no family_members row).
-- After this runs, the next sign-in lands on /(app)/onboarding.
--
-- update public.profiles
-- set onboarding_completed_at = null,
--     family_closed_by_owner_at = null
-- where id = (
--   select id from auth.users
--   where lower(email) = lower('kontosmario@gmail.com')
--   limit 1
-- );


-- ─── 3. (Optional) Rotate the family code ──────────────────────
-- Use this when the user is in a family but the code is blank /
-- compromised and you want to issue a new one without destroying
-- the family. Existing members keep their access; the new code is
-- the one to share with future joiners.
--
-- update public.families f
-- set code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
-- where f.id = (
--   select fm.family_id
--   from public.family_members fm
--   join auth.users u on u.id = fm.user_id
--   where lower(u.email) = lower('kontosmario@gmail.com')
--   limit 1
-- );
