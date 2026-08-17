-- FIX (2026-08-17): avisar cuando alguien deja el hogar.
--
-- Reportado por el owner: "un usuario necesita recibir una notificación si un
-- miembro abandona el hogar, esto hoy no pasa". El feature NO faltaba: estaba
-- construido al 80% y muerto por DOS motivos independientes.
--
--   1) El emisor estaba detrás de un gate FINANCIERO. `leave_current_family`
--      solo insertaba la fila `member_left` si el que se iba declaraba
--      `monthly_income_contribution > 0`. En prod 26 de 62 memberships tienen
--      aporte 0 → ~42% de las salidas no avisaban nada. Y el copy estaba
--      redactado como aviso contable ("El ingreso mensual del hogar bajó en
--      $X"), con el hecho social —se fue Fulano— subordinado al número.
--
--   2) Aunque se emitiera, `member_left` NUNCA se pusheaba: el relay
--      `list_unpushed_notifications` filtra por un allow-list de kinds que no
--      lo incluía. Quedaba como fila muda en el feed de la campanita.
--
-- Verificado antes de tocar nada: `select kind, count(*) from notifications
-- where kind = 'member_left'` devuelve VACÍO — en toda la historia de prod no
-- se emitió una sola vez.
--
-- Lo que ya existía y por eso este fix es chico: `member_left` ya está en
-- ALLOWED_PUSH_KINDS de la edge function send-family-push, ya tiene ícono
-- propio (👋) en el cliente y ya está testeado. Faltaba el emisor y el cable
-- del relay. Cero cambios de cliente, cero redeploy de edge functions.
--
-- Los tres cuerpos se reescriben COMPLETOS a partir del prosrc VIVO en prod
-- (no de la última migración): `list_unpushed_notifications` y
-- `leave_current_family` acumulan parches aplicados con replace() sobre la
-- definición viva, y redefinirlas desde un body viejo las revertiría en
-- silencio.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) leave_current_family — el que se va por su cuenta
--
-- Cambios sobre el cuerpo vivo, SOLO en la rama de miembro regular:
--   · se borra el gate `if coalesce(v_contribution, 0) > 0`;
--   · el insert único family-wide pasa a un LOOP POR MIEMBRO con el idioma de
--     cada receptor (mismo patrón que `cron_emit_streak_broken`), porque el
--     push se localiza por `profiles.preferred_language` del que RECIBE;
--   · el aporte pasa a ser una segunda oración condicional, no la condición
--     de existencia del aviso.
--
-- Lo que NO se toca a propósito:
--   · la rama `owner` (borra el hogar para todos): ya tiene su canal propio
--     vía `profiles.family_closed_by_owner_at`, y además borra las
--     push_subscriptions de toda la familia, así que no quedan tokens;
--   · la rama `v_remaining_members = 0` (borra la familia): una fila ahí se
--     iría por cascade;
--   · el ORDEN de las sentencias: el aviso va DESPUÉS del delete de
--     `family_members`, que es lo que garantiza que el que se fue no se
--     auto-notifique (el loop recorre los que quedan).
-- ─────────────────────────────────────────────────────────────────────────
-- Firma EXACTA de la función viva (`pg_get_function_result`): la segunda
-- columna se llama `family_code`, no `error` — Postgres rechaza el replace si
-- cambia un nombre de columna del TABLE (42P13). Devuelve null desde que se
-- dropeó `families.code`.
create or replace function public.leave_current_family()
returns table(family_id uuid, family_code text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_caller_role text;
  v_other_active_members integer;
  v_remaining_members integer;
  v_contribution numeric(12,2);
  v_display_name text;
  v_now timestamptz := now();
  v_member record;
  v_amount text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, fm.role, fm.monthly_income_contribution
    into v_current_family_id, v_caller_role, v_contribution
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  -- Dueño: ELIMINA el hogar para TODOS
  if v_caller_role = 'owner' then
    select count(*) into v_other_active_members
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.role <> 'blocked';

    if coalesce(v_other_active_members, 0) > 0 then
      update public.profiles p
      set onboarding_completed_at = null,
          family_closed_by_owner_at = v_now
      where p.id in (
        select fm.user_id
        from public.family_members fm
        where fm.family_id = v_current_family_id
          and fm.user_id <> v_user_id
      );
    end if;

    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.push_subscriptions
    where push_subscriptions.family_id = v_current_family_id;

    delete from public.family_members
    where family_members.family_id = v_current_family_id;

    delete from public.families
    where families.id = v_current_family_id;

    update public.profiles
    set onboarding_completed_at = null
    where profiles.id = v_user_id;

    return query
      select v_current_family_id, null::text;
    return;
  end if;

  -- Miembro regular: se va solo él
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);
    delete from public.families
    where families.id = v_current_family_id;
  else
    -- El aporte ya NO decide si se avisa: decide si el aviso menciona plata.
    v_amount := case
      when coalesce(v_contribution, 0) > 0
        then to_char(v_contribution, 'FM999G999G999D00')
      else null
    end;

    for v_member in
      select fm.user_id, coalesce(p.preferred_language, 'es') as lang
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_current_family_id
        and coalesce(fm.role, '') <> 'blocked'
    loop
      perform public.emit_notification(
        v_current_family_id,
        v_member.user_id,
        case when v_member.lang = 'en'
          then v_display_name || ' left your home'
          else v_display_name || ' dejó el hogar'
        end,
        case
          when v_amount is null and v_member.lang = 'en'
            then 'They no longer share this home''s expenses.'
          when v_amount is null
            then 'Ya no comparte los gastos de este hogar.'
          when v_member.lang = 'en'
            then 'Your home''s monthly income went down by $' || v_amount || '.'
          else 'El ingreso mensual del hogar bajó $' || v_amount || '.'
        end,
        'member_left',
        'info',
        v_user_id,
        jsonb_build_object(
          'left_user_id', v_user_id,
          'left_display_name', v_display_name,
          'monthly_income_removed', coalesce(v_contribution, 0),
          'route', '/settings'
        )
      );
    end loop;
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  return query
    select v_current_family_id, null::text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) family_remove_member — el dueño saca a alguien
--
-- Antes no avisaba a NADIE: ni al que sacaban ni a los que quedaban. Se suma
-- el mismo loop, después del delete de la membership (el sacado ya no está en
-- `family_members`, así que queda excluido por construcción y no recibe un
-- aviso sobre sí mismo). Sus push_subscriptions ya se borraron arriba, que es
-- la defensa en profundidad para el mismo caso.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.family_remove_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_family_id uuid;
  v_target_role text;
  v_target_name text;
  v_member record;
begin
  if auth.uid() is null then raise exception 'No session'; end if;

  perform public.enforce_rate_limit('family_remove_member', 5, 60);

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = auth.uid() and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el owner puede eliminar miembros.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'No podés eliminarte a vos mismo. Transferí la propiedad primero.';
  end if;

  select fm.role into v_target_role
  from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id = target_user_id;

  if v_target_role is null then
    raise exception 'Ese usuario no está en tu familia.';
  end if;

  if v_target_role = 'owner' then
    raise exception 'No podés eliminar a otro owner.';
  end if;

  select coalesce(p.display_name, 'Un miembro')
    into v_target_name
  from public.profiles p
  where p.id = target_user_id;

  -- Sprint G-DB G-DB2 (2026-06-10): scrub push subscriptions BEFORE
  -- removing the membership, so the kicked user stops receiving family
  -- notifications immediately. Mirrors `leave_current_family`.
  delete from public.push_subscriptions
  where user_id = target_user_id
    and family_id = v_family_id;

  delete from public.family_members
  where family_id = v_family_id and user_id = target_user_id;

  for v_member in
    select fm.user_id, coalesce(p.preferred_language, 'es') as lang
    from public.family_members fm
    left join public.profiles p on p.id = fm.user_id
    where fm.family_id = v_family_id
      and coalesce(fm.role, '') <> 'blocked'
  loop
    perform public.emit_notification(
      v_family_id,
      v_member.user_id,
      case when v_member.lang = 'en'
        then v_target_name || ' left your home'
        else v_target_name || ' dejó el hogar'
      end,
      case when v_member.lang = 'en'
        then 'They no longer share this home''s expenses.'
        else 'Ya no comparte los gastos de este hogar.'
      end,
      'member_left',
      'info',
      auth.uid(),
      jsonb_build_object(
        'left_user_id', target_user_id,
        'left_display_name', v_target_name,
        'removed_by', auth.uid(),
        'route', '/settings'
      )
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) list_unpushed_notifications — el cable que faltaba
--
-- Sin `member_left` en el allow-list, la fila se insertaba pero el relay nunca
-- la levantaba: quedaba como aviso mudo en la campanita. Con esto el cron
-- `notifications-push-backlog` (:20/:50) la pushea dentro de los ~30 min,
-- respetando el mínimo de 2 minutos de edad. El fan-out per-usuario y el
-- filtro de bloqueados ya los resuelve el orchestrator.
--
-- El resto del cuerpo se transcribe TAL CUAL del prosrc vivo.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.list_unpushed_notifications()
returns table(
  id uuid, family_id uuid, user_id uuid, title text, body text,
  kind text, severity text, metadata jsonb, created_at timestamptz
)
language sql
security definer
set search_path to 'public'
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
      'price_hike', 'goal_behind', 'assistant_dormant',
      -- Eventos del hogar (2026-08-17): alguien se fue o lo sacaron. Es un
      -- evento raro y de alto valor, así que va al push y no solo al feed.
      'member_left'
    )
  order by n.created_at asc
  -- Techo alto: ahora el relay es el ÚNICO emisor y absorbe la ráfaga de
  -- check-ins (antes se pusheaban inline sin tope). 5000 cubre el pico de una
  -- cohorte horaria a la escala actual con margen; el edge fn chunkea el envío.
  -- Si una ráfaga excede 5000, la cola se drena en las corridas siguientes
  -- (:20/:50 → ~10k/h); solo la cola se difiere, no se pierde (dentro de 24h).
  limit 5000;
$$;
