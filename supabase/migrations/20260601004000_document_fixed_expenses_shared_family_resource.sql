-- Document the intentional design of fixed_expenses as shared
-- family resources. Unlike `expenses` (per-member purchases) and
-- `fixed_expense_payments` (per-payment audit trail with paid_by),
-- fixed_expenses themselves (Alquiler, Luz, Internet, etc.) have
-- no created_by column and are intentionally mutable by any family
-- member. The shared resource is the agreed-upon commitment, not
-- the act of declaring it.
--
-- This decision was reaffirmed in code review #2 (2026-05-31) after
-- the gap-finder flagged the absence of created_by as a potential
-- vulnerability. Not a vulnerability — a product choice.
--
-- If product later wants per-fijo authorship + RLS tightening, add
-- created_by column + symmetric RLS to expenses_update_members.
--
-- Closes B2 product decision of code review #2.

comment on table public.fixed_expenses is
  'Shared family commitments (rent, utilities, subscriptions). Intentionally mutable by any family member — the resource is the agreement, not the declaration. Audit trail lives on fixed_expense_payments.paid_by. Code review #2 product decision (2026-05-31).';
