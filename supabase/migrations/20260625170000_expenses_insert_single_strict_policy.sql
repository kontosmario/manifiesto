-- WHAT: Resuelve el residual flageado de expenses INSERT (multiple_permissive +
--       hueco de seguridad). Había DOS policies permissive de INSERT OR-eadas:
--         · expenses_insert_members_created_by_self: member AND created_by=self (estricta)
--         · expenses_insert_active: is_family_member_active(family_id) — SIN chequear
--           created_by → debilitaba a la otra (un cliente hecho a mano podía insertar
--           un gasto con created_by de OTRO miembro y pasaba por esta).
--       Se reemplazan por UNA sola policy estricta.
-- WHY:  Verificado (recon adversarial) que los 3 paths user-facing escriben SIEMPRE
--       created_by = el usuario actual (add-expense manual, OCR/import batch, y el RPC
--       SECURITY DEFINER de fijos que fuerza auth.uid()). Forzar created_by=self NO
--       rompe ningún flujo legítimo y cierra el vector de atribución cruzada. Mantengo
--       is_family_member_active (excluye blocked) + auth.uid() envuelto (init-plan).

drop policy if exists expenses_insert_active on public.expenses;
drop policy if exists expenses_insert_members_created_by_self on public.expenses;

create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    public.is_family_member_active(family_id)
    and created_by = (select auth.uid())
  );
