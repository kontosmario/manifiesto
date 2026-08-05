-- Quick win #5 — bajar el spam de push notifications.
--
-- Contra prod: la sobrecarga percibida está dominada por los 3 check-ins
-- diarios per-usuario (morning/midday/evening). El de MEDIODÍA es ~1.8 push/
-- día/usuario (~26% del volumen de check-ins) y el de MENOR valor accionable
-- (genérico, sin dato nuevo). Además fue REACTIVADO por error en
-- 20260625070000 ("Activa midday"), contra la intención del audit previo.
--
-- Fix: desprogramamos el cron de midday. Server-only, cero cambios de cliente,
-- cero riesgo financiero (no toca cupo/saldo). morning + evening siguen activos.
-- Idempotente: solo desprograma si el job existe (re-ejecutable).
--
-- La rama `midday_checkins` de list_pending_notifications se deja intacta: es
-- inofensiva sin el cron que la dispara, y evita reescribir esa función acá.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notifications-midday') then
    perform cron.unschedule('notifications-midday');
  end if;
end $$;
