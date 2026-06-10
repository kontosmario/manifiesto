-- supabase/migrations/20260614000000_sprint_m_text_length_caps.sql
--
-- Sprint M · Audit #7 finding M-3 / R-1 (2026-06-14) — text length caps.
--
-- Problem:
--   User-controllable text columns (expenses.description,
--   fixed_expenses.name, fixed_expenses.lender_name, categories.name,
--   savings_goals.title, notifications.title, notifications.body) had
--   NO length CHECK constraint. A misbehaving / malicious client could
--   plant arbitrarily large strings (megabytes), which:
--     • Bloat storage and snapshot payloads.
--     • Flow into the control-advisor Claude prompt via
--       JSON.stringify, amplifying token cost per request.
--     • Slow down feeds, list rendering and OCR pipeline outputs.
--
--   The original baseline schema didn't bound them because Supabase
--   `text` columns are effectively unlimited and we relied on client
--   form validation. That's insufficient as a defense at the storage
--   layer.
--
-- Fix:
--   Add CHECK constraints with sensible caps derived from real-world
--   product usage (current longest values in production are well under
--   these caps):
--     expenses.description        ≤ 500 chars
--     fixed_expenses.name         ≤ 100 chars
--     fixed_expenses.lender_name  ≤ 100 chars
--     categories.name             ≤ 100 chars
--     savings_goals.title         ≤ 120 chars
--     notifications.title         ≤ 100 chars
--     notifications.body          ≤ 240 chars
--
-- Pattern — NOT VALID + manual VALIDATE later:
--   This migration uses the `add constraint ... NOT VALID` pattern. New
--   inserts / updates are rejected immediately, but EXISTING rows are
--   NOT scanned. That guarantees the migration succeeds even if a
--   legacy row somehow violates the cap (very unlikely given client
--   validation, but we don't take chances on a live DB).
--
--   To validate retroactively (once we've confirmed no legacy rows
--   violate via `select … where length(col) > N`), run from psql:
--     alter table public.expenses
--       validate constraint expenses_description_length_chk;
--     ... etc for each ...
--
--   Until validated, the constraint still BLOCKS new violations — only
--   pre-existing rows are exempt. That's the intended behavior for a
--   length cap.
--
-- Idempotent via `if not exists` on each constraint add. Safe to re-run.
--
-- Manual test plan:
--   1. Insert expenses.description with 600 chars → fails with check.
--   2. Insert expenses.description with 499 chars → succeeds.
--   3. Update an existing row's description to 600 chars → fails.
--   4. notifications row with body of 241 chars → fails.

-- expenses.description ≤ 500
alter table public.expenses
  drop constraint if exists expenses_description_length_chk;
alter table public.expenses
  add constraint expenses_description_length_chk
  check (char_length(description) <= 500) not valid;

-- fixed_expenses.name ≤ 100
alter table public.fixed_expenses
  drop constraint if exists fixed_expenses_name_length_chk;
alter table public.fixed_expenses
  add constraint fixed_expenses_name_length_chk
  check (char_length(name) <= 100) not valid;

-- fixed_expenses.lender_name ≤ 100 (nullable column → constraint must
-- allow NULL; CHECK over a NULL evaluates to UNKNOWN, treated as pass)
alter table public.fixed_expenses
  drop constraint if exists fixed_expenses_lender_name_length_chk;
alter table public.fixed_expenses
  add constraint fixed_expenses_lender_name_length_chk
  check (lender_name is null or char_length(lender_name) <= 100) not valid;

-- categories.name ≤ 100
alter table public.categories
  drop constraint if exists categories_name_length_chk;
alter table public.categories
  add constraint categories_name_length_chk
  check (char_length(name) <= 100) not valid;

-- savings_goals.title ≤ 120
alter table public.savings_goals
  drop constraint if exists savings_goals_title_length_chk;
alter table public.savings_goals
  add constraint savings_goals_title_length_chk
  check (char_length(title) <= 120) not valid;

-- notifications.title ≤ 100
alter table public.notifications
  drop constraint if exists notifications_title_length_chk;
alter table public.notifications
  add constraint notifications_title_length_chk
  check (char_length(title) <= 100) not valid;

-- notifications.body ≤ 240
alter table public.notifications
  drop constraint if exists notifications_body_length_chk;
alter table public.notifications
  add constraint notifications_body_length_chk
  check (char_length(body) <= 240) not valid;

comment on constraint expenses_description_length_chk on public.expenses is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap description ≤ 500 chars to '
  'prevent storage/payload bloat and Claude-prompt token amplification.';
comment on constraint fixed_expenses_name_length_chk on public.fixed_expenses is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap name ≤ 100 chars.';
comment on constraint fixed_expenses_lender_name_length_chk on public.fixed_expenses is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap lender_name ≤ 100 chars (nullable).';
comment on constraint categories_name_length_chk on public.categories is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap name ≤ 100 chars.';
comment on constraint savings_goals_title_length_chk on public.savings_goals is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap title ≤ 120 chars.';
comment on constraint notifications_title_length_chk on public.notifications is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap title ≤ 100 chars.';
comment on constraint notifications_body_length_chk on public.notifications is
  'Sprint M · Audit #7 M-3 (2026-06-14): cap body ≤ 240 chars.';
