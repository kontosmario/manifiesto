-- Fix RLS gap on public.expenses (security: HIGH).
--
-- Problem: the UPDATE and DELETE policies only checked is_family_member(family_id),
-- so ANY member of a family could edit or delete expenses created by ANOTHER member.
-- INSERT already required created_by = auth.uid(); UPDATE/DELETE did not.
--
-- Fix: a member can only mutate their OWN expenses (created_by = auth.uid());
-- the family owner retains full control for cleanup/admin (is_family_owner).
-- The WITH CHECK on UPDATE also keeps the row inside a family the actor belongs to,
-- preventing reassignment of an expense to another family.
--
-- See docs/auditorias/expansion-multisegmento-2026-05-22/README.md (C1)
-- and docs/operaciones/pendientes-seguridad.md.

drop policy if exists "expenses_update_members" on public.expenses;
create policy "expenses_update_members"
on public.expenses
for update
to authenticated
using (
  public.is_family_member(family_id)
  and (created_by = auth.uid() or public.is_family_owner(family_id))
)
with check (
  public.is_family_member(family_id)
  and (created_by = auth.uid() or public.is_family_owner(family_id))
);

drop policy if exists "expenses_delete_members" on public.expenses;
create policy "expenses_delete_members"
on public.expenses
for delete
to authenticated
using (
  public.is_family_member(family_id)
  and (created_by = auth.uid() or public.is_family_owner(family_id))
);
