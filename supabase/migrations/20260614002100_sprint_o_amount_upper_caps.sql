-- supabase/migrations/20260614002100_sprint_o_amount_upper_caps.sql
--
-- Sprint O · Audit #8 finding O-3 (2026-06-14) — money columns lack an
-- upper bound CHECK.
--
-- Problem:
--   Mobile enforces `EXPENSE_PRICE_MAX = 1_000_000_000` (one billion
--   pesos — well above any legitimate household-level transaction in
--   Argentina) and similar caps on income / fixed expense forms. But
--   the constraint is purely client-side. An attacker with a valid
--   session token can hit PostgREST directly and insert e.g. a
--   $9_999_999_999.99 expense row. The numeric(12,2) column accepts
--   up to 10^10 - 0.01 ≈ 9_999_999_999.99 before the type itself
--   overflows, so the planted row is stored verbatim.
--
--   Downstream impact:
--     • Aggregates (sum / avg / top-category share) get skewed for
--       the entire family until the row is found and deleted.
--     • The advisor prompt (control-advisor) is fed with the rogue
--       row inside the expense list — Claude generates nonsense tasks
--       ("recortá $9B en suscripciones") and burns tokens.
--     • The home-screen "cupo diario" math goes negative or NaN.
--     • Multi-family attackers can DoS the advisor budget.
--
-- Fix:
--   Add CHECK constraints capping every money column at 1_000_000_000
--   (matches the mobile constant). Use the NOT VALID + best-effort
--   VALIDATE pattern — same as
--   20260614000000_sprint_m_text_length_caps.sql:
--     1. `add constraint … check (…) not valid` blocks NEW writes
--        immediately, without scanning existing rows.
--     2. `validate constraint …` scans existing rows. If the scan
--        succeeds, future planners can rely on the constraint. If a
--        legacy row violates, the VALIDATE statement raises and the
--        migration STOPS (because the statement is in the same
--        migration). New writes are still blocked from the prior
--        `add constraint`, but the constraint is left UN-validated.
--
--   We attempt the VALIDATE here. If a future production migration
--   blows up because of a legacy violator, the fix is:
--     1. Query the bad row(s): `select id, ... from <t> where <col> > 1000000000`
--     2. Either cleanup or carve them out, then re-run VALIDATE.
--   Even without VALIDATE, the constraint blocks new violations.
--
-- Pre-flight data check (run BEFORE deploying this migration to prod):
--   select 'expenses' as t, count(*) from public.expenses where price > 1000000000
--   union all select 'fixed_expenses', count(*) from public.fixed_expenses where amount > 1000000000
--   union all select 'family_finance_income', count(*) from public.family_finance where monthly_income > 1000000000
--   union all select 'family_finance_goal', count(*) from public.family_finance where savings_goal > 1000000000
--   union all select 'savings_goals', count(*) from public.savings_goals where goal_amount > 1000000000
--   union all select 'income_events', count(*) from public.income_events where amount > 1000000000;
--
--   At the time of writing we don't expect any legacy violators because:
--     • mobile clients have always capped at 1B,
--     • the OCR import path also caps at 1B,
--     • no SQL backfill / admin RPC has ever planted bigger values.
--   If the pre-flight query shows >0 rows, document them and adjust
--   the VALIDATE step below before applying.
--
-- Idempotent via `drop constraint if exists` + `add constraint`. Safe
-- to re-run.

-- ─── expenses.price ───────────────────────────────────────────────────
alter table public.expenses
  drop constraint if exists expenses_price_cap;
alter table public.expenses
  add constraint expenses_price_cap
  check (price <= 1000000000) not valid;
alter table public.expenses
  validate constraint expenses_price_cap;

comment on constraint expenses_price_cap on public.expenses is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap expense price at 1_000_000_000 '
  '(mirrors mobile EXPENSE_PRICE_MAX). Prevents PostgREST direct-insert '
  'attacks from poisoning aggregates and the advisor prompt.';

-- ─── fixed_expenses.amount ────────────────────────────────────────────
alter table public.fixed_expenses
  drop constraint if exists fixed_expenses_amount_cap;
alter table public.fixed_expenses
  add constraint fixed_expenses_amount_cap
  check (amount <= 1000000000) not valid;
alter table public.fixed_expenses
  validate constraint fixed_expenses_amount_cap;

comment on constraint fixed_expenses_amount_cap on public.fixed_expenses is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap fixed expense amount at 1B.';

-- ─── family_finance.monthly_income ────────────────────────────────────
alter table public.family_finance
  drop constraint if exists family_finance_monthly_income_cap;
alter table public.family_finance
  add constraint family_finance_monthly_income_cap
  check (monthly_income <= 1000000000) not valid;
alter table public.family_finance
  validate constraint family_finance_monthly_income_cap;

comment on constraint family_finance_monthly_income_cap on public.family_finance is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap monthly_income at 1B.';

-- ─── family_finance.savings_goal ──────────────────────────────────────
alter table public.family_finance
  drop constraint if exists family_finance_savings_goal_cap;
alter table public.family_finance
  add constraint family_finance_savings_goal_cap
  check (savings_goal <= 1000000000) not valid;
alter table public.family_finance
  validate constraint family_finance_savings_goal_cap;

comment on constraint family_finance_savings_goal_cap on public.family_finance is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap savings_goal at 1B.';

-- ─── savings_goals.goal_amount ────────────────────────────────────────
alter table public.savings_goals
  drop constraint if exists savings_goals_goal_amount_cap;
alter table public.savings_goals
  add constraint savings_goals_goal_amount_cap
  check (goal_amount <= 1000000000) not valid;
alter table public.savings_goals
  validate constraint savings_goals_goal_amount_cap;

comment on constraint savings_goals_goal_amount_cap on public.savings_goals is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap savings_goals.goal_amount at 1B.';

-- ─── savings_goals.current_amount ─────────────────────────────────────
-- Bonus: same column is contribution-driven and could also be inflated
-- by a direct PostgREST update. Keep the same cap.
alter table public.savings_goals
  drop constraint if exists savings_goals_current_amount_cap;
alter table public.savings_goals
  add constraint savings_goals_current_amount_cap
  check (current_amount <= 1000000000) not valid;
alter table public.savings_goals
  validate constraint savings_goals_current_amount_cap;

comment on constraint savings_goals_current_amount_cap on public.savings_goals is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap savings_goals.current_amount at 1B.';

-- ─── income_events.amount ─────────────────────────────────────────────
alter table public.income_events
  drop constraint if exists income_events_amount_cap;
alter table public.income_events
  add constraint income_events_amount_cap
  check (amount <= 1000000000) not valid;
alter table public.income_events
  validate constraint income_events_amount_cap;

comment on constraint income_events_amount_cap on public.income_events is
  'Sprint O · Audit #8 O-3 (2026-06-14): cap income_events.amount at 1B.';
