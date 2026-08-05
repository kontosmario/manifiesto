-- Jardín "sin culpa" — suaviza las notificaciones punitivas de racha.
-- Decisión owner 2026-06-23 (sistema de rachas "Mi jardín"):
--   • at-risk: recordatorio del atardecer reformulado a la metáfora del jardín,
--     SIN deadline ni "se corta" (severity info, no warning).
--   • broken: el corte de la racha YA NO se notifica (un hueco no se anuncia).
--     El estado se mantiene (current_streak=0 = "pausa" del contador), pero el
--     jardín no marchita y no hay aviso de culpa.
-- NO toca advance_streak ni la programación de los crons; solo el cuerpo de las
-- dos funciones. Las recovery-nudges (re-engagement) quedan intactas.

-- ─── at-risk · recordatorio gentil del jardín ──────────────────────────────
create or replace function public.cron_emit_streak_at_risk()
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
  v_kind text;
  v_title text;
  v_body text;
  v_severity text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.current_streak,
           us.freeze_tokens, us.last_logged_date
    from public.user_streaks us
    where us.current_streak > 0
      and us.streak_broken_at is null
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      -- Ventana 19:00–21:00 local, una vez por día local.
      if v_local_hour < 19 or v_local_hour > 21 then
        continue;
      end if;
      if v_rec.last_logged_date = v_today_local then
        continue;
      end if;

      -- "Sin culpa": recordatorio del jardín, sin deadline ni "se corta".
      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint';
        v_title := 'Tu jardín te espera 🌱';
        v_body := 'Si hoy no registrás un movimiento, una semilla guardada cubre el día.';
        v_severity := 'info';
      else
        v_kind := 'streak_at_risk';
        v_title := 'Tu jardín te espera 🌱';
        v_body := 'Registrá tu día cuando puedas y sumás un brote a tu jardín.';
        v_severity := 'info';
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = v_kind
          and (n.created_at at time zone v_tz)::date = v_today_local
      ) then
        continue;
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        v_title,
        v_body,
        v_kind,
        v_severity,
        null,
        jsonb_build_object('route', '/expenses', 'current_streak', v_rec.current_streak, 'freeze_tokens', v_rec.freeze_tokens)
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$function$;

-- ─── broken · estado sin aviso punitivo ────────────────────────────────────
create or replace function public.cron_emit_streak_broken()
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
  v_new_tokens smallint;
begin
  for v_rec in
    select us.id, us.family_id, us.user_id,
           us.current_streak, us.longest_streak,
           us.freeze_tokens, us.last_logged_date, us.streak_broken_at
    from public.user_streaks us
    where us.current_streak > 0
      and us.streak_broken_at is null
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      if v_rec.last_logged_date is null then
        continue;
      end if;
      if v_rec.last_logged_date >= v_today_local - 1 then
        continue;
      end if;

      -- Escudo cubre un único día salteado (gap = 2). Sigue avisando (positivo).
      if v_rec.last_logged_date = v_today_local - 2 and v_rec.freeze_tokens > 0 then
        v_new_tokens := v_rec.freeze_tokens - 1;
        update public.user_streaks
        set freeze_tokens = v_new_tokens,
            last_logged_date = v_today_local - 1,
            updated_at = now()
        where id = v_rec.id;

        if v_local_hour between 9 and 21 then
          if not exists (
            select 1 from public.notifications n
            where n.family_id = v_rec.family_id
              and n.user_id = v_rec.user_id
              and n.kind = 'shield_used'
              and (n.created_at at time zone v_tz)::date = v_today_local
          ) then
            perform public.emit_notification(
              v_rec.family_id,
              v_rec.user_id,
              'Tu escudo salvó la racha',
              'No registraste ayer, pero se consumió 1 escudo. Te quedan ' || v_new_tokens || '.',
              'shield_used',
              'info',
              null,
              jsonb_build_object('route', '/expenses', 'freeze_tokens', v_new_tokens)
            );
          end if;
        end if;
        continue;
      end if;

      -- True break: gap > 2 días, o sin escudos. current_streak → 0 (pausa del
      -- contador; longest_streak se preserva). "Sin culpa": YA NO se notifica el
      -- corte (un hueco no se anuncia; el jardín no marchita).
      update public.user_streaks
      set current_streak = 0,
          streak_broken_at = now(),
          days_since_last_token_grant = 0,
          updated_at = now()
      where id = v_rec.id;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$function$;
