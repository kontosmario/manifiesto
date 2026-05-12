-- WHAT: Lockdown explícito de las funciones admin_delete_account +
--       cron_process_account_deletions: solo service_role puede
--       ejecutarlas. Quita los grants implícitos que Supabase otorga
--       por default al role `authenticated`.
--
-- WHY:  En Supabase, `revoke all on function from public` NO revoca el
--       privilegio que tiene `authenticated` por su grant default a
--       todas las funciones públicas. Sin este lockdown, un usuario
--       autenticado podría:
--
--         - Disparar el batch processor manualmente
--           (cron_process_account_deletions) → solo borraría cuentas
--           ya elegibles, pero igual rompe el contrato de "esto solo
--           lo dispara el cron".
--
--         - Llamar admin_delete_account(target_user_id) → solo borra
--           si target_user ya marcó deletion_scheduled_at vencido,
--           así que un atacante no puede unilateralmente borrar
--           víctimas. Pero igual no debería ser invocable por
--           cualquier authenticated user.
--
--       Ninguna explotación práctica grave fue descubierta durante el
--       review (las validaciones internas defienden bien) pero el
--       defense-in-depth manda que las funciones admin sean
--       service_role-only de jure, no solo de facto.
--
-- ROLLBACK: re-grant a authenticated si por alguna razón se necesita
--           que un usuario logueado pueda disparar el processor.

revoke all on function public.admin_delete_account(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_account(uuid) to service_role;

revoke all on function public.cron_process_account_deletions()
  from public, anon, authenticated;
grant execute on function public.cron_process_account_deletions() to service_role;

-- request_account_deletion + cancel_account_deletion SÍ son
-- user-facing (los dispara el cliente desde Settings → Cuenta).
-- Quedan con grant a authenticated, como ya estaban. La función
-- valida internamente que el caller no esté borrando a otra persona
-- (lee auth.uid() y solo modifica filas del caller).
