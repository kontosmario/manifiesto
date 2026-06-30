-- =====================================================================
-- Notificación de reactivación del asistente financiero ("dormido").
--
-- El asistente es 100% determinístico: sin gastos cargados no puede
-- dimensionar el cupo ni detectar patrones — degrada con gracia (señales
-- válidas-o-ausentes) pero queda "en silencio". Cuando un usuario que YA
-- usó la app deja de registrar por ~1 semana, le avisamos una sola vez por
-- episodio de inactividad para que retome y el asistente vuelva a servir.
--
-- Patrón espejo de cron_emit_streak_recovery_nudge (20260626200000):
-- por-miembro, timezone-aware, gateado por preferencias, dedup por episodio.
-- Copy server-side ES/EN (no depende de un build del cliente). La entrega
-- es vía el relay de backlog (list_unpushed_notifications -> send-family-push),
-- por eso 'assistant_dormant' se agrega a esa allow-list.
-- =====================================================================

-- 1) Allow-list del relay: que el backlog empuje también 'assistant_dormant'.
create or replace function public.list_unpushed_notifications()
returns table (
  id uuid,
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  metadata jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select n.id, n.family_id, n.user_id, n.title, n.body, n.kind, n.metadata
  from public.notifications n
  where n.pushed_at is null
    and n.created_at >= now() - interval '24 hours'
    and n.kind in (
      'streak_at_risk', 'streak_broken', 'shield_used', 'shield_auto_hint',
      'streak_recovery_nudge', 'zombie_alert', 'zombie_detected',
      'price_hike', 'goal_behind', 'assistant_dormant'
    )
  order by n.created_at asc
  limit 500;
$$;

revoke all on function public.list_unpushed_notifications() from public;
grant execute on function public.list_unpushed_notifications() to service_role;

-- 2) Cron: avisar a usuarios dormidos (≥7 días sin actividad).
create or replace function public.cron_emit_assistant_dormant()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rec record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_local_dow integer;
  v_days_since integer;
  v_title text;
  v_body text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.last_logged_date,
           coalesce(p.preferred_language, 'es') as lang
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    left join public.profiles p on p.id = us.user_id
    where us.last_logged_date is not null
      -- Pre-filtro grueso (server-date): descarta usuarios activos sin recorrer
      -- cada hora. Holgura de 1 día por timezone; el gate fino (≥7 local) va abajo.
      and us.last_logged_date <= current_date - 6
      and coalesce(np.nudges_enabled, true)
      and coalesce(np.channel_inapp, true)
      and not ('assistant_dormant' = any (coalesce(np.kinds_muted, array[]::text[])))
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      -- Ventana suave: 11h local, martes o jueves. No invasivo.
      if v_local_hour <> 11 then continue; end if;
      v_local_dow := extract(dow from v_today_local)::int; -- 0=dom..6=sáb
      if v_local_dow not in (2, 4) then continue; end if;
      -- Dormido: sin registrar hace una semana o más.
      v_days_since := v_today_local - v_rec.last_logged_date;
      if v_days_since < 7 then continue; end if;
      -- Un único aviso por episodio de inactividad (anclado a last_logged_date):
      -- si retoma y vuelve a dormirse, last_logged_date cambia -> nuevo episodio.
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id and n.user_id = v_rec.user_id
          and n.kind = 'assistant_dormant'
          and n.metadata->>'episode' = v_rec.last_logged_date::text
      ) then continue; end if;
      if v_rec.lang = 'en' then
        v_title := 'Your assistant needs data';
        v_body := 'It''s been a week without logging. Without spending data it can''t size your daily budget or spot patterns — it just stays quiet. Log one expense and it reads your rhythm again.';
      else
        v_title := 'Tu asistente necesita datos';
        v_body := 'Hace una semana que no registras gastos. Sin datos no puede calcular tu cupo ni anticipar nada — se queda en silencio. Registra un gasto y vuelve a leerte el ritmo.';
      end if;
      -- El cliente rutea por `data.url` (notification-router-bridge); el relay
      -- pasa el metadata tal cual como `data`. Por eso la clave es `url`.
      -- '/(app)/(tabs)/control' ya está en SAFE_PUSH_ROUTES (degrada a /home
      -- en builds previos a ese cambio de cliente).
      perform public.emit_notification(
        v_rec.family_id, v_rec.user_id, v_title, v_body,
        'assistant_dormant', 'info', null,
        jsonb_build_object(
          'url', '/(app)/(tabs)/control',
          'episode', v_rec.last_logged_date::text,
          'days_since', v_days_since));
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

revoke all on function public.cron_emit_assistant_dormant() from public;

-- 3) Schedule: cada hora (minuto :25, escalonado del resto). La función gatea
--    a las 11h local + martes/jueves, así cada timezone dispara a su hora.
do $$
begin
  perform cron.schedule(
    'assistant-dormant',
    '25 * * * *',
    $cron$select public.cron_emit_assistant_dormant();$cron$
  );
end $$;
