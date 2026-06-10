-- supabase/migrations/20260612001200_sprint_f_savings_goals_column_control.sql
--
-- Sprint F-DB · Red team finding F8 (2026-06-10):
--   `savings_goals_update_owner` (20260424001858) allows the owner to
--   UPDATE any column of `savings_goals`, including `current_amount`.
--   The service-role audit trigger captures writes from `service_role`
--   only — so an owner can forge their savings progress (current_amount)
--   from the client without leaving a trail. Even worse, they could
--   write negative values.
--
--   The legitimate write paths for `current_amount` are all SECURITY
--   DEFINER RPCs:
--     • add_savings_contribution
--     • apply_month_close_decision (meta branch)
--     • apply_reserve_decision (meta branch)
--
--   None of these need direct UPDATE access from the authenticated
--   client.
--
-- Fix (option a from the audit):
--   1. CHECK constraint `current_amount >= 0` for defense-in-depth.
--   2. Column-level REVOKE UPDATE on `current_amount` from `authenticated`.
--      RPCs run as SECURITY DEFINER (function owner) so they keep
--      access. RLS `savings_goals_update_owner` still gates the
--      OTHER columns (title, goal_amount, is_active, etc.).
--
-- Manual test plan:
--   1. Owner updates `title` directly via PostgREST → succeeds.
--   2. Owner updates `current_amount` directly via PostgREST → raises
--      permission denied on column.
--   3. add_savings_contribution RPC → current_amount grows (unchanged).
--   4. Try to insert / update current_amount < 0 → CHECK violation.

-- ── 1. CHECK constraint: current_amount >= 0 ────────────────────────
alter table public.savings_goals
  drop constraint if exists savings_goals_current_amount_nonneg;

alter table public.savings_goals
  add constraint savings_goals_current_amount_nonneg
  check (current_amount >= 0);

-- ── 2. Column-level UPDATE revoke ──────────────────────────────────
-- Before we can revoke column-level update, the role needs to have
-- the broad UPDATE grant (PostgREST grants UPDATE on table to
-- `authenticated` by default in Supabase). Then we revoke only the
-- single column. PostgREST honors column-level grants; SECDEF RPCs
-- bypass them because they run as the function owner (postgres).
revoke update (current_amount) on public.savings_goals from authenticated;

comment on column public.savings_goals.current_amount is
  'Accumulated savings progress. WRITES RESTRICTED (Sprint F-DB F8, '
  '2026-06-10): authenticated role cannot UPDATE this column directly. '
  'Legitimate write paths are SECURITY DEFINER RPCs only '
  '(add_savings_contribution, apply_month_close_decision, '
  'apply_reserve_decision). CHECK ensures non-negative.';
