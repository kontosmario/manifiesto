-- WHAT: Fase 2 — las notis emitidas por crons SQL (no por el orchestrator)
--       ignoraban `kinds_muted` y `nudges_enabled`: silenciar "racha/meta/fijos"
--       o apagar "nudges" NO las frenaba (solo el push global vía channel_push).
--       Fix al ORIGEN (sin tocar el edge function):
--         · streak_at_risk / shield_auto_hint / streak_recovery_nudge (user-scoped,
--           ya tz-correctas) → gate por nudges_enabled + kinds_muted.
--         · price_hike / goal_behind (broadcast, user_id null) → se convierten a
--           emit POR-MIEMBRO, salteando a quien los tenga muteados. Así el mute
--           per-usuario funciona en feed Y push sin tocar el orchestrator (cada
--           miembro tiene su fila o ninguna).
-- WHY:  Settings deben reflejar realidad. channel_inapp/channel_push (canales) NO
--       se tocan acá: el push ya respeta channel_push (drop de tokens en el edge).

-- ── streak_at_risk: + nudges_enabled (WHERE) + kinds_muted (loop) ────────────
create or replace function public.cron_emit_streak_at_risk()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_rec record; v_tz text; v_today_local date; v_local_hour integer;
  v_kind text; v_title text; v_body text; v_severity text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.current_streak, us.freeze_tokens, us.last_logged_date,
           coalesce(np.kinds_muted, array[]::text[]) as kinds_muted
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    where us.current_streak > 0 and us.streak_broken_at is null
      and coalesce(np.nudges_enabled, true)            -- apagar "nudges" frena esto
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      if v_local_hour < 19 or v_local_hour > 21 then continue; end if;
      if v_rec.last_logged_date = v_today_local then continue; end if;

      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint'; v_title := 'Tu jardín te espera 🌱';
        v_body := 'Si hoy no registrás un movimiento, una semilla guardada cubre el día.'; v_severity := 'info';
      else
        v_kind := 'streak_at_risk'; v_title := 'Tu jardín te espera 🌱';
        v_body := 'Registrá tu día cuando puedas y sumás un brote a tu jardín.'; v_severity := 'info';
      end if;

      if v_kind = any (v_rec.kinds_muted) then continue; end if;   -- silenciar "racha"

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id and n.user_id = v_rec.user_id and n.kind = v_kind
          and (n.created_at at time zone v_tz)::date = v_today_local
      ) then continue; end if;

      perform public.emit_notification(v_rec.family_id, v_rec.user_id, v_title, v_body, v_kind, v_severity, null,
        jsonb_build_object('route', '/expenses', 'current_streak', v_rec.current_streak, 'freeze_tokens', v_rec.freeze_tokens));
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

-- ── streak_recovery_nudge: + nudges_enabled (WHERE) + kinds_muted (loop) ─────
create or replace function public.cron_emit_streak_recovery_nudge()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_rec record; v_tz text; v_today_local date; v_local_hour integer;
  v_days_since integer; v_milestone integer; v_title text; v_body text;
  v_seed bigint; v_pick integer;
begin
  for v_rec in
    select us.family_id, us.user_id, us.longest_streak, us.streak_broken_at,
           coalesce(np.kinds_muted, array[]::text[]) as kinds_muted
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    where us.streak_broken_at is not null and us.current_streak = 0
      and us.streak_broken_at > now() - interval '15 days'
      and coalesce(np.nudges_enabled, true)
      and not ('streak_recovery_nudge' = any (coalesce(np.kinds_muted, array[]::text[])))
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      if v_local_hour < 10 or v_local_hour > 20 then continue; end if;
      v_days_since := v_today_local - (v_rec.streak_broken_at at time zone v_tz)::date;
      if v_days_since not in (1, 3, 7, 14) then continue; end if;
      v_milestone := v_days_since;
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id and n.user_id = v_rec.user_id
          and n.kind = 'streak_recovery_nudge' and (n.metadata->>'nudge_day')::int = v_milestone
      ) then continue; end if;

      v_seed := abs(hashtextextended(v_rec.user_id::text, v_milestone));
      v_pick := (v_seed % 3)::int;
      if v_milestone = 1 then
        v_title := 'Hoy es buen día para volver';
        v_body := case v_pick
          when 0 then case when v_rec.longest_streak >= 7
              then 'Tu marca de ' || v_rec.longest_streak || ' días sigue tuya. Un gasto y arrancás otra racha.'
              else 'Una racha nueva empieza con un solo registro. Hoy puede ser ese día.' end
          when 1 then 'Anotá lo primero que gastés hoy y volvés al ruedo. Es así de simple.'
          else 'Ayer pasó. Hoy podés arrancar el día 1 de tu próximo récord.' end;
      elsif v_milestone = 3 then
        v_title := 'Tres días sin registrar';
        v_body := case v_pick
          when 0 then 'Volver es más fácil que mantener — un solo movimiento y reactivás la racha.'
          when 1 then 'Un café, un mandado, lo que sea. Basta con un gasto para arrancar de nuevo.'
          else 'No hace falta esperar al lunes. Podés volver hoy mismo.' end;
      elsif v_milestone = 7 then
        v_title := 'Una semana — pero todavía estás a tiempo';
        v_body := case v_pick
          when 0 then 'Tu cuenta sigue acá esperando. Un gasto registrado hoy y volvés al juego.'
          when 1 then case when v_rec.longest_streak >= 14
              then 'Llegaste a ' || v_rec.longest_streak || ' días una vez. Podés volver a hacerlo.'
              else 'No mires lo que pasó — mirá lo que viene. Hoy es el día 1.' end
          else 'A veces la mejor racha empieza después de una pausa. Probá hoy.' end;
      else
        v_title := 'Última nota antes de soltar';
        v_body := case v_pick
          when 0 then case when v_rec.longest_streak >= 14
              then 'Tus ' || v_rec.longest_streak || ' días siguen siendo récord. Si querés volver, hoy es buen momento.'
              else 'Si querés retomar el hábito, hoy es buen momento. No te vamos a insistir más.' end
          when 1 then 'Si volvés en algún momento, va a ser el día 1 de algo nuevo. Te dejamos en paz por ahora.'
          else 'Esta es la última. Si retomás, lo celebramos. Si no, también.' end;
      end if;

      perform public.emit_notification(v_rec.family_id, v_rec.user_id, v_title, v_body,
        'streak_recovery_nudge', 'info', null,
        jsonb_build_object('route', '/expenses', 'nudge_day', v_milestone, 'longest_streak', v_rec.longest_streak));
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

-- ── price_hike: broadcast → POR-MIEMBRO, salteando muteados ──────────────────
create or replace function public.cron_detect_price_hikes()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_rec record; v_family_id uuid; v_name text; v_member record; v_title text; v_body text; v_meta jsonb;
begin
  for v_rec in
    select h.fixed_expense_id, h.previous_amount, h.new_amount, h.delta_pct
    from public.fixed_expense_price_history h
    where h.changed_at >= now() - interval '24 hours' and coalesce(h.delta_pct, 0) >= 10
    order by h.changed_at desc
  loop
    begin
      select fe.family_id, fe.name into v_family_id, v_name from public.fixed_expenses fe where fe.id = v_rec.fixed_expense_id;
      if v_family_id is null then continue; end if;

      v_title := 'Subió ' || coalesce(nullif(btrim(v_name), ''), 'un compromiso');
      v_body := '+' || to_char(v_rec.delta_pct, 'FM990.0') || '% · de $'
        || to_char(round(coalesce(v_rec.previous_amount, 0)), 'FM999,999,999')
        || ' a $' || to_char(round(v_rec.new_amount), 'FM999,999,999') || '.';
      v_meta := jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', v_rec.fixed_expense_id,
        'previous_amount', v_rec.previous_amount, 'new_amount', v_rec.new_amount, 'delta_pct', v_rec.delta_pct);

      for v_member in
        select fm.user_id, coalesce(np.kinds_muted, array[]::text[]) as kinds_muted
        from public.family_members fm
        left join public.notification_preferences np on np.user_id = fm.user_id
        where fm.family_id = v_family_id and fm.role <> 'blocked'
      loop
        if 'price_hike' = any (v_member.kinds_muted) then continue; end if;          -- silenciar "fijos"
        if exists (
          select 1 from public.notifications n
          where n.family_id = v_family_id and n.user_id = v_member.user_id and n.kind = 'price_hike'
            and (n.metadata ->> 'fixed_expense_id') = v_rec.fixed_expense_id::text
            and n.created_at >= now() - interval '7 days'
        ) then continue; end if;
        perform public.emit_notification(v_family_id, v_member.user_id, v_title, v_body, 'price_hike', 'info', null, v_meta);
      end loop;
    exception when others then
      raise notice 'price hike detect failed for fixed_expense %: %', v_rec.fixed_expense_id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_detect_price_hikes: %', sqlerrm;
end; $function$;

-- ── goal_behind (weekly insights): broadcast → POR-MIEMBRO, salteando muteados ─
create or replace function public.cron_emit_weekly_insights()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_fam record; v_goal record; v_cycle_start date; v_member record;
  v_contrib_this_cycle numeric(12,2); v_target_pace numeric(12,2); v_months_remaining integer;
  v_title text; v_body text; v_meta jsonb;
begin
  for v_fam in select f.id as family_id from public.families f loop
    begin
      v_cycle_start := public.user_current_cycle_start(v_fam.family_id);
      for v_goal in
        select sg.id, sg.title, sg.goal_amount, sg.current_amount, sg.target_months
        from public.savings_goals sg
        where sg.family_id = v_fam.family_id and sg.is_active and sg.created_at::date < v_cycle_start
      loop
        begin
          if coalesce(v_goal.target_months, 0) <= 0 or coalesce(v_goal.goal_amount, 0) <= 0 then continue; end if;
          v_months_remaining := greatest(1, coalesce(v_goal.target_months, 1));
          v_target_pace := (coalesce(v_goal.goal_amount, 0) - coalesce(v_goal.current_amount, 0)) / v_months_remaining;
          select coalesce(sum(((n.metadata ->> 'delta')::numeric)), 0) into v_contrib_this_cycle
          from public.notifications n
          where n.family_id = v_fam.family_id and n.kind = 'goal_contribution'
            and (n.metadata ->> 'goal_id') = v_goal.id::text
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_cycle_start;

          if v_target_pace > 0 and v_contrib_this_cycle < 0.3 * v_target_pace then
            v_title := 'Vas atrasado con ' || v_goal.title;
            v_body := 'Este ciclo aportaste $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
              || ' · ritmo sugerido $' || to_char(round(v_target_pace), 'FM999,999,999') || '/mes.';
            v_meta := jsonb_build_object('route', '/savings-goal', 'goal_id', v_goal.id,
              'contribution', v_contrib_this_cycle, 'target_pace', v_target_pace);

            for v_member in
              select fm.user_id, coalesce(np.kinds_muted, array[]::text[]) as kinds_muted
              from public.family_members fm
              left join public.notification_preferences np on np.user_id = fm.user_id
              where fm.family_id = v_fam.family_id and fm.role <> 'blocked'
            loop
              if 'goal_behind' = any (v_member.kinds_muted) then continue; end if;          -- silenciar "meta"
              if exists (
                select 1 from public.notifications n
                where n.family_id = v_fam.family_id and n.user_id = v_member.user_id and n.kind = 'goal_behind'
                  and (n.metadata ->> 'goal_id') = v_goal.id::text
                  and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
              ) then continue; end if;
              perform public.emit_notification(v_fam.family_id, v_member.user_id, v_title, v_body, 'goal_behind', 'warning', null, v_meta);
            end loop;
          end if;
        exception when others then null;
        end;
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;
