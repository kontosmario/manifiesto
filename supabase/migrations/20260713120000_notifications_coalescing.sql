-- Notification coalescing (owner: "si hay 2 notificaciones que están por
-- triggerear juntas, se simplifiquen a una sola conjunta").
--
-- Modelo: el relay `push_backlog` pasa a ser el ÚNICO emisor de push. Los kinds
-- que antes pusheaban inline (check-ins + fixed_upcoming) se insertan
-- insert-only (pushed_at NULL) desde el orchestrator, y el relay agrupa por
-- destinatario todas las filas sin pushear y manda UN push combinado cuando hay
-- 2+. El feed in-app queda granular (cada fila sigue existiendo); solo colapsa
-- el push. Los sociales/de evento (send-family-push directo) NO tocan esta tabla
-- → siguen instantáneos.
--
-- ⚠️⚠️ ORDEN DE DEPLOY OBLIGATORIO ⚠️⚠️
-- 1º APLICAR ESTA MIGRACIÓN, 2º recién después DEPLOYAR el edge fn.
-- Motivo: el edge fn nuevo hace los check-ins insert-only (no pushea inline) y
-- confía en que el relay los tenga en el allow-list. Si el edge fn se deploya
-- ANTES que esta migración, los check-ins se insertan pero el relay viejo NO los
-- selecciona → se PIERDEN en silencio hasta que aterrice la migración.
-- El orden inverso (migración primero) es seguro: el edge fn viejo sigue
-- pusheando inline y el allow-list ampliado nunca re-selecciona filas ya
-- pusheadas (filtro pushed_at is null).
-- Validar en staging: (a) 2 push juntas → 1, (b) los check-ins siguen llegando.

-- (1) El allow-list del relay ahora incluye los check-ins + fixed_upcoming, con:
--   · settle window (created_at <= now()-2min): no cortar una ráfaga a mitad.
--   · severity + created_at en el output: elegir la ruta del combinado (mayor
--     severidad) y ordenar los headlines por hora.
-- Cambia el tipo de retorno → DROP + CREATE (create-or-replace no puede cambiar
-- el return type).
drop function if exists public.list_unpushed_notifications();
create function public.list_unpushed_notifications()
returns table (
  id uuid,
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  severity text,
  metadata jsonb,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select n.id, n.family_id, n.user_id, n.title, n.body, n.kind,
         n.severity, n.metadata, n.created_at
  from public.notifications n
  where n.pushed_at is null
    and n.created_at >= now() - interval '24 hours'
    and n.created_at <= now() - interval '2 minutes'
    and n.kind in (
      -- Pipeline A (antes inline, ahora insert-only → coalescible). El digest de
      -- fijos se emite con kind='fixed_upcoming' (el prefijo _digest es solo del
      -- dedup_key), así que alcanza con 'fixed_upcoming'.
      'checkin_morning', 'checkin_midday', 'checkin_evening', 'fixed_upcoming',
      -- Pipeline B (ya eran relay):
      'streak_at_risk', 'streak_broken', 'shield_used', 'shield_auto_hint',
      'streak_recovery_nudge', 'zombie_alert', 'zombie_detected',
      'price_hike', 'goal_behind', 'assistant_dormant'
    )
  order by n.created_at asc
  -- Techo alto: ahora el relay es el ÚNICO emisor y absorbe la ráfaga de
  -- check-ins (antes se pusheaban inline sin tope). 5000 cubre el pico de una
  -- cohorte horaria a la escala actual con margen; el edge fn chunkea el envío.
  -- Si una ráfaga excede 5000, la cola se drena en las corridas siguientes
  -- (:20/:50 → ~10k/h); solo la cola se difiere, no se pierde (dentro de 24h).
  limit 5000;
$$;

-- Lockdown: solo service_role (el orchestrator la llama con esa key). Mantiene
-- el patrón de 20260630020000_lock_internal_security_definer_functions.
revoke all on function public.list_unpushed_notifications() from public, anon, authenticated;
grant execute on function public.list_unpushed_notifications() to service_role;

-- (2) Reprogramar el relay para que corra DESPUÉS de la ráfaga de emisores
-- (check-ins :00 · price_hike :05 · weekly :10 · recovery :15 · dormant :25).
-- :20 y :50 → cada corrida arrastra una ráfaga completa y la colapsa en 1 push.
-- Trade-off aceptado por el owner: el check-in de las 9:00 llega ~9:20.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'notifications-push-backlog') then
    perform cron.unschedule('notifications-push-backlog');
  end if;
end $$;
select cron.schedule(
  'notifications-push-backlog',
  '20,50 * * * *',
  $$select public.dispatch_notifications_kind('push_backlog');$$
);
