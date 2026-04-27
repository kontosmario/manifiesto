-- Per-cycle "starting balance" override on family_finance.
--
-- Why: salaries vary month-to-month (bonuses, commissions, irregular
-- pay, mid-cycle signups). The recurring `monthly_income` stays as
-- the *expected* salary; this override captures what the user
-- actually has available for the *current* cycle.
--
-- Two columns encode a tri-state per cycle:
--   • anchor IS NULL OR anchor != current_pay_cycle_start
--       → user has not been asked about this cycle yet, prompt them.
--   • anchor === current_pay_cycle_start AND balance IS NULL
--       → user kept the default salary for this cycle, no override.
--   • anchor === current_pay_cycle_start AND balance IS NOT NULL
--       → user adjusted; engine uses `balance` as the cycle's
--         starting cash, prorating fixed/savings to remaining days.
--
-- When the next pay cycle starts, `anchor` is stale → the dashboard
-- re-prompts. The override naturally auto-resets without a cron job.
--
-- No backfill: existing users will see the prompt on next dashboard
-- visit, which is the desired behaviour (the feature delivers value
-- to them too).

alter table public.family_finance
  add column if not exists current_cycle_starting_balance numeric null,
  add column if not exists current_cycle_anchor date null;

comment on column public.family_finance.current_cycle_starting_balance is
  'User-reported available cash at the start of the current pay '
  'cycle. NULL when the user kept the default monthly_income. '
  'Auto-staled when the cycle advances (anchor mismatch).';

comment on column public.family_finance.current_cycle_anchor is
  'Date of the pay-cycle start this override applies to. Used to '
  'detect stale overrides: when the dashboard computes a new '
  'pay-cycle start that does not match this anchor, the override '
  'is ignored and the user is re-prompted to confirm/adjust.';
