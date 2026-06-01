-- Fix RLS gap on public.notifications DELETE policy.
--
-- Problem: notifications_delete_members policy (mobile_baseline.sql:993)
-- only checks is_family_member(family_id), so any family member can
-- delete notifications targeted at ANOTHER user. UPDATE was tightened
-- in 20260510000000_security_hardening_rls.sql:82 with the same
-- (user_id is null or user_id = auth.uid()) constraint, but DELETE
-- was missed. Symmetric to the expenses (20260522000000) and
-- fixed_expense_payments (20260601000000) fixes.
--
-- Closes Important #B1 of 2026-05-31 code review #2.

drop policy if exists "notifications_delete_members" on public.notifications;
create policy "notifications_delete_members"
on public.notifications
for delete
to authenticated
using (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
);
