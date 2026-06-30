-- Auto-recuperación del jardín cuando un escudo salva la racha (Opción A).
--
-- CONTEXTO / por qué:
--   Había DOS mecánicas de escudo desconectadas:
--     1) RACHA (automática): si faltás 1 día y tenés escudo, el motor consume
--        el escudo solo para mantener `current_streak` viva — vía Case 3 de
--        `_advance_streak_internal` (al registrar el día siguiente) o vía el
--        cron de medianoche `cron_emit_streak_broken`.
--     2) JARDÍN visual (MANUAL): el día faltado igual se dibujaba como hueco
--        y el usuario tenía que "plantar" el hueco a mano (RPC
--        `recover_garden_day`), gastando OTRO escudo. Eso nunca fue la
--        intención: la recuperación debe ser automática según la constancia.
--   Resultado: el número de racha decía "sobreviviste" pero el jardín mostraba
--   un día marchito, y un solo día faltado podía costar hasta 2 escudos.
--
-- QUÉ HACE ESTA MIGRACIÓN:
--   Cada vez que el motor consume un escudo para puentear un día faltado, AHORA
--   también registra ese día en `garden_recovered_days`. Efecto:
--     - El jardín muestra ese día como 'recuperado' (brote coral) automáticamente,
--       sin tap ni 2do escudo (grid + tira semanal de Home + cierre de semana).
--     - El día recuperado llena el hueco, así que el plantado manual ya no tiene
--       sentido y el cliente borra esa superficie (deriveRecoverableGap, RPC
--       recover_garden_day caller, celda tappable).
--   OJO: el día recuperado NO cuenta como actividad ORGÁNICA — el score del cierre
--   de semana sigue siendo 6/7 ("gran semana", no "perfecta") y la floración sigue
--   exigiendo 7/7 orgánico. El escudo salva la racha, no fabrica una floración.
--   No cambia la matemática de la racha — es puramente aditivo (1 insert
--   idempotente por `on conflict (user_id, day) do nothing`).
--
-- Sólo recupera FUTUROS puentes; los días puenteados en el pasado no se
-- backfillean (quedan como estaban). El RPC manual `recover_garden_day` se deja
-- en su lugar (sin caller) por compatibilidad; puede deprecarse más adelante.

create or replace function public._advance_streak_internal(p_family_id uuid, p_user_id uuid, p_event_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.user_streaks%rowtype;
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
begin
  -- Upsert row.
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row
  from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id
  for update;

  -- ─ Recovery case: streak was broken (current_streak = 0, broken_at
  --   set). The first present-day log restarts at day 1 and clears
  --   the broken marker. Idempotent on same-day repeat (next branch).
  if v_row.streak_broken_at is not null and v_row.current_streak = 0 then
    if v_row.last_logged_date = p_event_date then
      return; -- same day, already recovered
    end if;
    update public.user_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 0: same day → idempotent.
  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

  -- Case 1: first ever log.
  if v_row.last_logged_date is null then
    update public.user_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  v_gap := p_event_date - v_row.last_logged_date;

  -- Case 2: consecutive day (gap = 1).
  if v_gap = 1 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 1;
    v_new_tokens := v_row.freeze_tokens;
    if v_new_days_since >= 30 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.user_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 3: exactly one missed day + shield → consume shield, advance.
  if v_gap = 2 and v_row.freeze_tokens > 0 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 2;
    v_new_tokens := v_row.freeze_tokens - 1;
    if v_new_days_since >= 30 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.user_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    -- Auto-recuperación del jardín: el escudo que acaba de salvar la racha
    -- también planta el día faltado (p_event_date - 1) en el jardín, así el
    -- grid lo muestra 'recuperado' solo (sin plantado manual ni 2do escudo).
    -- Sub-bloque aislado: un fallo del insert del jardín NUNCA debe revertir el
    -- decremento del escudo + el avance de racha ya aplicados arriba.
    begin
      insert into public.garden_recovered_days (family_id, user_id, day)
      values (p_family_id, p_user_id, p_event_date - 1)
      on conflict (user_id, day) do nothing;
    exception when others then null;
    end;
    return;
  end if;

  -- Case 4: gap > shield-coverable → real break. The midnight cron
  -- normally handles breaks proactively, but this branch catches
  -- the rare race where a user goes silent past the cron run and
  -- then logs a present-day expense. We TREAT IT AS RECOVERY:
  -- start a fresh day-1 streak (consistent with the recovery branch
  -- above) instead of regressing to a level boundary. The user
  -- shouldn't be punished further for finally coming back.
  update public.user_streaks
  set current_streak = 1,
      longest_streak = greatest(v_row.longest_streak, 1),
      total_days_logged = v_row.total_days_logged + 1,
      last_logged_date = p_event_date,
      streak_broken_at = null,
      days_since_last_token_grant = 1,
      updated_at = now()
  where id = v_row.id;
end;
$function$;

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
  v_lang text;
begin
  for v_rec in
    select us.id, us.family_id, us.user_id,
           us.current_streak, us.longest_streak,
           us.freeze_tokens, us.last_logged_date, us.streak_broken_at,
           coalesce(p.preferred_language, 'es') as lang
    from public.user_streaks us
    left join public.profiles p on p.id = us.user_id
    where us.current_streak > 0
      and us.streak_broken_at is null
  loop
    begin
      v_lang := v_rec.lang;
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      if v_rec.last_logged_date is null then
        continue;
      end if;
      if v_rec.last_logged_date >= v_today_local - 1 then
        continue;
      end if;

      if v_rec.last_logged_date = v_today_local - 2 and v_rec.freeze_tokens > 0 then
        v_new_tokens := v_rec.freeze_tokens - 1;
        update public.user_streaks
        set freeze_tokens = v_new_tokens,
            last_logged_date = v_today_local - 1,
            updated_at = now()
        where id = v_rec.id;

        -- Auto-recuperación del jardín: el escudo que acaba de salvar la racha
        -- a medianoche también planta el día faltado (ayer = v_today_local - 1)
        -- en el jardín → se muestra 'recuperado' solo, sin plantado manual.
        -- Sub-bloque aislado: un fallo del insert del jardín NUNCA debe revertir
        -- el decremento del escudo + el avance ya aplicados arriba.
        begin
          insert into public.garden_recovered_days (family_id, user_id, day)
          values (v_rec.family_id, v_rec.user_id, v_today_local - 1)
          on conflict (user_id, day) do nothing;
        exception when others then null;
        end;

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
              case when v_lang = 'en' then 'Your shield saved the streak' else 'Tu escudo salvó la racha' end,
              case when v_lang = 'en'
                   then 'You didn''t log yesterday, but 1 shield was used. You have ' || v_new_tokens || ' left.'
                   else 'No registraste ayer, pero se consumió 1 escudo. Te quedan ' || v_new_tokens || '.' end,
              'shield_used',
              'info',
              null,
              jsonb_build_object('route', '/expenses', 'freeze_tokens', v_new_tokens)
            );
          end if;
        end if;
        continue;
      end if;

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
