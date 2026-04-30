-- Adds an explicit foreign-key from `expenses.created_by` to
-- `public.profiles(id)` so PostgREST infers the join relationship and
-- the client can `.select('*, profiles(display_name)')` in one
-- round-trip instead of two (audit §3.3 / item 24).
--
-- Logically redundant: `expenses.created_by` already references
-- `auth.users(id)`, and `profiles.id` references `auth.users(id)` too.
-- Both keys are equal for any given user, so the new FK never
-- diverges in practice — its job is purely to expose the relationship
-- to the PostgREST schema cache.
--
-- The constraint is `not valid` initially to avoid scanning the
-- entire `expenses` table on apply; we validate immediately after,
-- which uses a SHARE UPDATE EXCLUSIVE lock instead of ACCESS
-- EXCLUSIVE — significantly less disruptive on tables of any size.

alter table public.expenses
  add constraint expenses_created_by_profile_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete restrict
  not valid;

-- Validate separately so we can pre-check data integrity without
-- holding an ACCESS EXCLUSIVE lock for the duration.
alter table public.expenses
  validate constraint expenses_created_by_profile_fkey;

-- Force PostgREST to re-read the schema so the new relationship is
-- available for embed selects immediately.
notify pgrst, 'reload schema';
