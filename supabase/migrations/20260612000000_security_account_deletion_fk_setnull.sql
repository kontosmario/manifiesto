-- supabase/migrations/20260612000000_security_account_deletion_fk_setnull.sql
--
-- Sprint E · Red team finding C1 (2026-06-10):
--   Account deletion is impossible for any user who logged ≥1 expense
--   (or recorded any of the historical "actor" rows below) because the
--   FK on those columns defaults to NO ACTION = RESTRICT. When
--   `admin_delete_account` (cron) runs `delete from auth.users` the
--   deletion fails and the row stays around forever → Apple App Review
--   rejects under guideline 5.1.1(v) iv because the in-app "Delete
--   Account" button doesn't actually delete the account.
--
--   Even worse: `expenses.created_by` was declared `NOT NULL`, so SET
--   NULL alone wouldn't work — we also need to drop the NOT NULL.
--
-- Fix:
--   • Drop NOT NULL on the actor columns we're switching to SET NULL.
--   • Drop the existing FK constraints (both the auth.users-targeted
--     and the profiles-targeted shadows).
--   • Re-add each FK with ON DELETE SET NULL.
--
-- Tables/columns audited and fixed:
--   • expenses.created_by                 → auth.users(id)  + profiles(id) shadow
--   • month_close_decisions.decided_by    → auth.users(id)
--   • income_events.created_by            → auth.users(id)
--   • fixed_expense_payments.paid_by      → auth.users(id)
--
-- Already correct (ON DELETE SET NULL) and left as-is:
--   • notifications.created_by
--   • family_invites.created_by
--
-- Idempotent: every constraint drop uses IF EXISTS; column nullability
-- changes are guarded against re-runs (DROP NOT NULL is a no-op if the
-- column is already nullable).
--
-- Manual test plan (run after apply):
--   1. \d public.expenses                  → fkey shows ON DELETE SET NULL
--   2. \d public.month_close_decisions     → decided_by_fkey ON DELETE SET NULL
--   3. \d public.income_events             → created_by_fkey ON DELETE SET NULL
--   4. \d public.fixed_expense_payments    → paid_by_fkey ON DELETE SET NULL
--   5. Simulate a deletion of an `auth.users` row that has expense rows
--      → succeeds, expense.created_by becomes NULL, RLS still scopes by
--        family_id so the row is not orphaned from family perspective.

-- ════════════════════════════════════════════════════════════════════
-- expenses.created_by
-- ════════════════════════════════════════════════════════════════════
alter table public.expenses
  alter column created_by drop not null;

-- The original FK from 20260413154000_mobile_baseline.sql is unnamed
-- (created inline with the column), so Postgres auto-named it
-- `expenses_created_by_fkey`. Drop both that and the explicit
-- profile-targeted shadow added in 20260504000000.
alter table public.expenses
  drop constraint if exists expenses_created_by_fkey;
alter table public.expenses
  drop constraint if exists expenses_created_by_profile_fkey;

alter table public.expenses
  add constraint expenses_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete set null;

-- Keep the profile-targeted shadow so PostgREST embeds still work
-- (see 20260504000000_expenses_profile_fk.sql for the rationale). Same
-- ON DELETE SET NULL semantics — profiles.id cascades from auth.users.
alter table public.expenses
  add constraint expenses_created_by_profile_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete set null
  not valid;

-- Validate without ACCESS EXCLUSIVE — matches the original pattern.
alter table public.expenses
  validate constraint expenses_created_by_profile_fkey;

-- ════════════════════════════════════════════════════════════════════
-- month_close_decisions.decided_by
-- ════════════════════════════════════════════════════════════════════
alter table public.month_close_decisions
  alter column decided_by drop not null;

alter table public.month_close_decisions
  drop constraint if exists month_close_decisions_decided_by_fkey;

alter table public.month_close_decisions
  add constraint month_close_decisions_decided_by_fkey
  foreign key (decided_by)
  references auth.users(id)
  on delete set null;

-- ════════════════════════════════════════════════════════════════════
-- income_events.created_by
-- ════════════════════════════════════════════════════════════════════
alter table public.income_events
  alter column created_by drop not null;

alter table public.income_events
  drop constraint if exists income_events_created_by_fkey;

alter table public.income_events
  add constraint income_events_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete set null;

-- ════════════════════════════════════════════════════════════════════
-- fixed_expense_payments.paid_by
-- ════════════════════════════════════════════════════════════════════
alter table public.fixed_expense_payments
  alter column paid_by drop not null;

alter table public.fixed_expense_payments
  drop constraint if exists fixed_expense_payments_paid_by_fkey;

alter table public.fixed_expense_payments
  add constraint fixed_expense_payments_paid_by_fkey
  foreign key (paid_by)
  references auth.users(id)
  on delete set null;

-- Force PostgREST to re-read the schema so the rebuilt FK relationships
-- are visible to embed selects immediately.
notify pgrst, 'reload schema';
