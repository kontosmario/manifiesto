-- Cadencia de escudos: 30 días → SEMANAL (1 escudo por semana completa de racha).
--
-- Decisión owner 2026-06-30: ganás 1 escudo por semana cargada / semana completa
-- (7 días consecutivos de racha), no cada 30 días. Esto RESTAURA el diseño
-- original (`20260423212513_shield_cadence_weekly`, que había sido pisado de
-- vuelta a 30 por `20260505234115_streak_recovery_system`).
--
-- Único cambio vs `20260630030000`: el umbral de grant `>= 30` → `>= 7` en las
-- dos ramas que avanzan la racha (Case 2 = día consecutivo, Case 3 = día puenteado
-- por escudo). Cap sigue en 2 (CHECK 0..2 + guard `< 2`). Mantiene intacto el
-- auto-plant del jardín (`garden_recovered_days`). El contador
-- `days_since_last_token_grant` se respeta tal cual (no se resetea para usuarios
-- existentes: en su próximo registro, si ya acumularon ≥7, reciben el escudo —
-- una sola vez, acotado por el cap).
--
-- `recompute_user_streak` reusa esta función (no tiene lógica propia), así que
-- replays heredan la cadencia semanal automáticamente.

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
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row
  from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id
  for update;

  if v_row.streak_broken_at is not null and v_row.current_streak = 0 then
    if v_row.last_logged_date = p_event_date then
      return;
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

  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

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

  -- Case 2: día consecutivo (gap = 1). Escudo cada 7 días de racha (semana completa).
  if v_gap = 1 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 1;
    v_new_tokens := v_row.freeze_tokens;
    if v_new_days_since >= 7 and v_new_tokens < 2 then
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
    if v_new_days_since >= 7 and v_new_tokens < 2 then
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
    -- Auto-recuperación del jardín: el escudo que salvó la racha planta el día
    -- faltado (p_event_date - 1). Sub-bloque aislado: un fallo del insert NUNCA
    -- debe revertir el decremento del escudo + el avance de racha de arriba.
    begin
      insert into public.garden_recovered_days (family_id, user_id, day)
      values (p_family_id, p_user_id, p_event_date - 1)
      on conflict (user_id, day) do nothing;
    exception when others then null;
    end;
    return;
  end if;

  -- Case 4: gap > shield-coverable → real break, tratado como recovery (día 1).
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
