-- recompute_family_income debe dispararse también en cambios de `role`, no solo
-- de monthly_income_contribution/family_id.
--
-- Sin esto, bloquear un miembro (family_block_member: role → 'blocked', sin tocar
-- su monthly_income_contribution) NO recalculaba el total del hogar, así que su
-- aporte seguía sumando pese a la exclusión de bloqueados que agregó
-- 20260630070000. Con `role` en la lista, bloquear/desbloquear/transferir dueño
-- recalcula el total (un bloqueado = retirado → su aporte se va con él).
drop trigger if exists trg_family_members_recompute_income on public.family_members;
create trigger trg_family_members_recompute_income
  after insert or delete or update of monthly_income_contribution, family_id, role
  on public.family_members
  for each row
  execute function public.recompute_family_income();
