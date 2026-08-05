-- Endurecer las funciones del relay de notificaciones.
--
-- `revoke ... from public` NO quita los grants explícitos que Supabase aplica
-- por default privileges (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE TO anon,
-- authenticated). Por eso list_unpushed_notifications() y cron_emit_assistant_dormant()
-- quedaban ejecutables por anon/authenticated pese al revoke previo.
--
-- list_unpushed_notifications() es SECURITY DEFINER y devuelve títulos/bodies/
-- family_id de TODAS las notificaciones sin push de TODAS las familias, sin chequeo
-- interno de auth → un authenticated podía leakear data cross-tenant. Solo la llama
-- el orchestrator vía service_role. cron_emit_assistant_dormant() solo la corre pg_cron.
revoke execute on function public.list_unpushed_notifications() from anon, authenticated;
revoke execute on function public.cron_emit_assistant_dormant() from anon, authenticated;
