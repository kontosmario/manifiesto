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
-- ⚠️ Este cambio depende del edge fn notifications-orchestrator (mismo PR).
-- Validar en staging que (a) 2 push juntas → 1, y (b) los check-ins siguen
-- llegando (ahora vía el relay), ANTES de aplicar a prod.

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
      -- Pipeline A (antes inline, ahora insert-only → coalescible):
      'checkin_morning', 'checkin_midday', 'checkin_evening',
      'fixed_upcoming', 'fixed_upcoming_digest',
      -- Pipeline B (ya eran relay):
      'streak_at_risk', 'streak_broken', 'shield_used', 'shield_auto_hint',
      'streak_recovery_nudge', 'zombie_alert', 'zombie_detected',
      'price_hike', 'goal_behind', 'assistant_dormant'
    )
  order by n.created_at asc
  limit 500;
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
