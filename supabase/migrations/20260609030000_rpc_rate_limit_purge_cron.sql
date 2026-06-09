-- supabase/migrations/20260609030000_rpc_rate_limit_purge_cron.sql
--
-- Sprint B · B2 — Cron diario que purga rows viejas de rpc_rate_limit.
--
-- La tabla `rpc_rate_limit` tiene PK compuesto `(user_id, rpc_name)`
-- así que crece linealmente con users × RPCs throttleadas (~10s mil
-- rows en el cap). No es problema de espacio, pero queremos limpieza
-- rutinaria para que el index se mantenga sano y queries de soporte
-- no vean rows viejas.
--
-- Threshold: `window_start < now() - 24h`. Si una row no se tocó en
-- las últimas 24 horas la borramos — la siguiente llamada del user
-- la recrea con count=1.
--
-- Patrón replicado de 20260423220137_notifications_cron.sql (creación
-- de extensión defensiva + unschedule antes de schedule para
-- re-runability).

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available on this project plan: %', sqlerrm;
end;
$$;

do $$
declare
  v_has_cron boolean;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping rpc_rate_limit purge schedule.';
    return;
  end if;

  -- Drop any pre-existing schedule with the same name so la migración
  -- es re-runable.
  begin
    perform cron.unschedule('rpc-rate-limit-purge');
  exception when others then null;
  end;

  -- 03:00 UTC daily (00:00 AR). Fuera de pico para no competir con
  -- los crons de notifs.
  perform cron.schedule(
    'rpc-rate-limit-purge',
    '0 3 * * *',
    $cron$delete from public.rpc_rate_limit where window_start < now() - interval '24 hours';$cron$
  );
exception when others then
  raise notice 'pg_cron scheduling failed: %', sqlerrm;
end;
$$;
