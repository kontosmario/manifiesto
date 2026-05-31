-- Fix RLS gap on public.fixed_expense_payments (security: HIGH).
--
-- Problem: UPDATE and DELETE policies only checked
-- is_fixed_expense_family_member(fixed_expense_id), so ANY member of
-- a family could edit or delete payment rows created by ANOTHER
-- member (mutate amount, paid_at, or silently delete history).
-- INSERT already required paid_by = auth.uid(); UPDATE/DELETE did not.
--
-- Fix: a member can only mutate their OWN payments
-- (paid_by = auth.uid()); the family owner retains full control
-- (is_family_owner(family_id resolved from the parent fixed_expense)).
--
-- Symmetric to 20260522000000_fix_expenses_rls_owner_scope.sql.
-- Closes P0 #2 of 2026-05-31 code review.

drop policy if exists "fixed_expense_payments_update_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_update_members"
on public.fixed_expense_payments
for update
to authenticated
using (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
)
with check (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
);

drop policy if exists "fixed_expense_payments_delete_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_delete_members"
on public.fixed_expense_payments
for delete
to authenticated
using (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
);
