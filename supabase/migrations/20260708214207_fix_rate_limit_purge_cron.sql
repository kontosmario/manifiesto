-- ════════════════════════════════════════════════════════════════════
-- FIX: la purga diaria de rate limits era un NO-OP silencioso.
--
-- El job 'rpc-rate-limit-purge' (20260609030000) borraba de
-- public.rpc_rate_limit (SINGULAR) — una tabla LEGACY del primer rate
-- limiter, vacía (0 filas; solo la referencia check_rate_limit, tampoco
-- usada). El cron reportaba "succeeded" cada noche mientras la tabla
-- REAL (public.rpc_rate_limits, plural — escrita por el guard vigente)
-- acumulaba sin purga desde mayo (~2.6k filas, 768 KB).
--
-- Fix: re-apuntar el job a la función canónica
-- cron_prune_rpc_rate_limits() (ventana 7 días, definida en
-- 20260512051000 y nunca schedulada) + purga inicial inmediata.
--
-- La tabla legacy rpc_rate_limit y check_rate_limit quedan como
-- candidatas a DROP en una limpieza posterior (decisión owner).
-- ════════════════════════════════════════════════════════════════════

select cron.unschedule('rpc-rate-limit-purge');

select cron.schedule(
  'rpc-rate-limit-purge',
  '0 3 * * *',
  $$select public.cron_prune_rpc_rate_limits()$$
);

-- Purga inicial: las ~2.4k filas con más de 7 días acumuladas mientras
-- el job apuntaba a la tabla equivocada.
select public.cron_prune_rpc_rate_limits();
