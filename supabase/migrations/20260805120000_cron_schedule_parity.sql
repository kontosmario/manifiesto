-- Paridad del CRON entre el repo y producción.
--
-- Detectado el 2026-08-05 al levantar staging: el calendario de cron que
-- producen las migraciones NO es el que corre en prod. Prod se fue arreglando a
-- mano (sobre todo durante las tormentas de push de julio) y esos arreglos
-- nunca volvieron al repo. Una base reconstruida — staging, o prod si algún día
-- se rehace — nacía con el calendario viejo y ruidoso.
--
-- Las cuatro divergencias, y por qué prod tiene razón:
--
-- 1) `midday-checkins` seguía programado. La migración
--    20260713180219_unschedule_midday_checkin intentó apagarlo pero desprograma
--    'notifications-midday', un nombre que NO existe: el job real se llama
--    'midday-checkins' (lo crea 20260423220137_notifications_cron). O sea que
--    ese "quick win contra el spam de push" nunca se ejecutó de verdad; en prod
--    el job se apagó a mano. Acá se apaga por el nombre correcto.
--
-- 2) `evening-checkins` era un DUPLICADO legacy. Los check-ins de la tarde hoy
--    salen por 'notifications-evening', que llama al relay
--    dispatch_notifications_kind('evening_checkins'). El job viejo emitía en
--    paralelo. Prod ya no lo tiene.
--
-- 3) `streak-at-risk` y `streak-broken` quedaron CADA HORA por
--    20260505234115_streak_recovery_system. Prod los tiene una vez por día
--    (23:00 y 02:59). Correrlos cada hora es exactamente la tormenta de push
--    que se apagó en julio.
--
-- 4) Faltaba `notifications-fixed-upcoming`. Ninguna migración lo crea: se armó
--    a mano en prod cuando se migró el aviso de fijos al relay. Sin él, el
--    recordatorio de gastos fijos no sale.
--
-- Idempotente y no-op en prod: deja el cron exactamente en el estado que prod
-- ya tiene. Ver docs/operaciones/ambiente-dev.md.

do $$
begin
  -- ── (1) y (2): apagar los emisores legacy ────────────────────────────────
  if exists (select 1 from cron.job where jobname = 'midday-checkins') then
    perform cron.unschedule('midday-checkins');
    raise notice 'cron parity: midday-checkins desprogramado';
  end if;

  if exists (select 1 from cron.job where jobname = 'evening-checkins') then
    perform cron.unschedule('evening-checkins');
    raise notice 'cron parity: evening-checkins desprogramado (duplicado de notifications-evening)';
  end if;

  -- ── (3): rachas, de cada hora a una vez por día ──────────────────────────
  if exists (select 1 from cron.job where jobname = 'streak-at-risk' and schedule <> '0 23 * * *') then
    perform cron.schedule('streak-at-risk', '0 23 * * *',
      $cron$select public.cron_emit_streak_at_risk();$cron$);
    raise notice 'cron parity: streak-at-risk pasa a diario 23:00';
  end if;

  if exists (select 1 from cron.job where jobname = 'streak-broken' and schedule <> '59 2 * * *') then
    perform cron.schedule('streak-broken', '59 2 * * *',
      $cron$select public.cron_emit_streak_broken();$cron$);
    raise notice 'cron parity: streak-broken pasa a diario 02:59';
  end if;

  -- ── (4): recordatorio de fijos vía el relay ──────────────────────────────
  if not exists (select 1 from cron.job where jobname = 'notifications-fixed-upcoming') then
    perform cron.schedule('notifications-fixed-upcoming', '0 12 * * *',
      $cron$select public.dispatch_notifications_kind('fixed_upcoming');$cron$);
    raise notice 'cron parity: notifications-fixed-upcoming programado 12:00';
  end if;
end $$;
