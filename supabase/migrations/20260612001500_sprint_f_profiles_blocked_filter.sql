-- supabase/migrations/20260612001500_sprint_f_profiles_blocked_filter.sql
--
-- Sprint F-DB · Red team finding F12 (2026-06-10):
--   `profiles_select_same_family_or_self` (20260413154000:887) currently:
--
--     create policy "profiles_select_same_family_or_self"
--     on public.profiles
--     for select
--     using (
--       id = auth.uid()
--       or exists (
--         select 1
--         from public.family_members mine
--         join public.family_members theirs on theirs.family_id = mine.family_id
--         where mine.user_id = auth.uid()
--           and theirs.user_id = profiles.id
--       )
--     );
--
--   Two issues:
--     1. A blocked family member (role='blocked', or blocked_at != null
--        on legacy rows) can still SELECT every profile in the family
--        because the EXISTS only joins by family_id. They keep visibility
--        into who's in the family even after being blocked.
--     2. An active member can SELECT a blocked member's profile (the
--        blocked user's display_name / avatar). Less severe but the
--        symmetric fix tightens both sides.
--
-- Fix:
--   Add explicit `role <> 'blocked'` filters to BOTH sides of the
--   join (mine and theirs). Keep `id = auth.uid()` shortcut so the
--   user can always read their own profile (including if they were
--   blocked — they need it for display in their own session).
--
-- Manual test plan:
--   1. Active member SELECTs another active member → succeeds.
--   2. Active member SELECTs blocked member → 0 rows.
--   3. Blocked member SELECTs other family member → 0 rows.
--   4. Any user SELECTs self → succeeds.

drop policy if exists "profiles_select_same_family_or_self" on public.profiles;
create policy "profiles_select_same_family_or_self"
  on public.profiles
  for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.family_members mine
      join public.family_members theirs
        on theirs.family_id = mine.family_id
      where mine.user_id = auth.uid()
        and mine.role <> 'blocked'
        and theirs.user_id = profiles.id
        and theirs.role <> 'blocked'
    )
  );

comment on policy "profiles_select_same_family_or_self" on public.profiles is
  'Sprint F-DB F12 (2026-06-10): excludes blocked members from both '
  'sides of the family-visibility join. A blocked user can no longer '
  'see other family profiles; active members can no longer see blocked '
  'users'' profiles. Self-read always allowed regardless of role.';
