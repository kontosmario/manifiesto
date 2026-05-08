-- WHAT: Cambia los pg_cron schedules para que llamen al orchestrator
--       vía pg_net.http_post, en vez de las funciones cron_emit_* viejas.
-- WHY: La Edge orchestrator chunkea y manda push en bulk. Reduce
--       invocaciones Edge de ~5000/día a ~50/día.
-- ROLLBACK: re-aplicar el schedule de 20260423220137_notifications_cron.sql.

-- ════════════════════════════════════════════════════════════════════
-- SETUP EN PRODUCCIÓN (antes de aplicar esta migración en prod)
-- Como superuser en producción:
--
--   alter database postgres set "app.settings.orchestrator_url"
--     = 'https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator';
--   alter database postgres set "app.settings.service_role_key"
--     = '<service-role-key>';
--
-- En local Supabase no aplica; el RAISE NOTICE lo skippa gracefully.
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  v_has_cron boolean;
  v_has_pg_net boolean;
  v_url text;
  v_auth text;
  v_old_jobs text[] := array[
    'morning-checkins', 'midday-checkins', 'streak-at-risk',
    'evening-checkins', 'streak-broken', 'fixed-upcoming', 'weekly-insights'
  ];
  v_name text;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;
  if not v_has_cron or not v_has_pg_net then
    raise notice 'pg_cron or pg_net not available; skipping handover.';
    return;
  end if;

  -- URL del orchestrator y service-role key vienen de vault o config.
  -- Asume que existen GUCs configurados:
  --   app.settings.orchestrator_url
  --   app.settings.service_role_key
  v_url := current_setting('app.settings.orchestrator_url', true);
  v_auth := 'Bearer ' || current_setting('app.settings.service_role_key', true);

  if v_url is null then
    raise notice 'app.settings.orchestrator_url not configured; skipping handover.';
    return;
  end if;

  -- Desactivar schedules viejos (cada uno con su propio bloque de excepción)
  foreach v_name in array v_old_jobs loop
    begin perform cron.unschedule(v_name); exception when others then null; end;
  end loop;

  -- Crear schedules nuevos que llaman al orchestrator
  perform cron.schedule(
    'notifications-morning', '0 12 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'morning_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-midday', '0 17 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'midday_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-evening', '30 23 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'evening_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-fixed-upcoming', '0 12 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'fixed_upcoming')
    );$cron$, v_url, v_auth)
  );
exception when others then
  raise notice 'cron handover failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- Re-aplicar 20260423220137_notifications_cron.sql para volver al modelo viejo.
