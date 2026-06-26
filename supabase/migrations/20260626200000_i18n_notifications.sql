-- i18n notifications: resolve server-side push/in-app copy by the recipient's
-- profiles.preferred_language ('es' | 'en' | null -> 'es').
--
-- These notifications are generated server-side (cron + edge orchestrator) while
-- the user is offline, so the language must be chosen in SQL, not on the client.
--
-- Scope = LIVE functions only:
--   * list_pending_notifications(text)  -> morning/midday/evening checkins + fixed_upcoming
--     (driven by dispatch_notifications_kind -> notifications-orchestrator edge fn)
--   * cron_emit_streak_at_risk()        -> job streak-at-risk
--   * cron_emit_streak_broken()         -> job streak-broken
--   * cron_emit_streak_recovery_nudge() -> job streak-recovery
--   * cron_emit_weekly_insights()       -> job weekly-insights (goal_behind)
--
-- Spanish copy is preserved BYTE-FOR-BYTE; English is added alongside.
-- Dynamic values (amounts, names, days, counts) keep being interpolated with || / to_char().
-- Signatures (params + returned columns) are unchanged.
--
-- NOT touched (legacy / not scheduled): cron_emit_morning_checkins,
-- cron_emit_midday_checkins, cron_emit_evening_checkins, cron_emit_fixed_upcoming.

-- =====================================================================
-- 1) list_pending_notifications(p_kind)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_pending_notifications(p_kind text)
 RETURNS TABLE(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_kind = 'morning_checkins' then
    return query
    with base as (
      select fm.family_id, fm.user_id, coalesce(p.display_name, 'vos') as display_name,
        coalesce(p.preferred_language, 'es') as lang,
        ff.monthly_income, coalesce(ff.salary_payment_day, 1) as salary_day, coalesce(ff.savings_goal, 0) as savings_goal,
        ff.last_salary_confirmed_at,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode, coalesce(ff.daily_budget_buffer_value, 0) as buffer_value,
        coalesce(np.checkin_morning_hour, 9) as pref_hour,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      cross join lateral (select public.user_local_timezone(fm.user_id) as user_tz) tz
      where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
        and not ('checkin_morning' = any (coalesce(np.kinds_muted, array[]::text[])))
    ),
    member as (select b.* from base b where b.pref_hour = b.hour_local),
    cycle as (
      select m.*,
        case when extract(day from m.today_local)::int >= least(m.salary_day,
            extract(day from (date_trunc('month', m.today_local) + interval '1 month' - interval '1 day'))::int)
          then make_date(extract(year from m.today_local)::int, extract(month from m.today_local)::int,
            least(m.salary_day, extract(day from (date_trunc('month', m.today_local) + interval '1 month' - interval '1 day'))::int))
          else make_date(extract(year from (m.today_local - interval '1 month'))::int, extract(month from (m.today_local - interval '1 month'))::int,
            least(m.salary_day, extract(day from (date_trunc('month', m.today_local) - interval '1 day'))::int))
        end as cycle_start
      from member m
    ),
    computed as (
      select c.*, greatest(1, ((c.cycle_start + interval '1 month')::date - c.cycle_start)) as dias_ciclo,
        (c.last_salary_confirmed_at is not null and c.last_salary_confirmed_at >= c.cycle_start::timestamptz) as confirmado,
        greatest(0, c.monthly_income
          + coalesce((select sum(ie.amount) from public.income_events ie where ie.family_id = c.family_id
              and ie.event_date >= c.cycle_start and ie.event_date < (c.cycle_start + interval '1 month')::date), 0)
          - coalesce((select sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency)) from public.fixed_expenses fe
              where fe.family_id = c.family_id and coalesce(fe.status, 'active') = 'active'), 0)
          - c.savings_goal) as libre,
        coalesce((select sum(e.price) from public.expenses e where e.family_id = c.family_id
            and e.archived_at is null and e.commitment_id is null and e.created_at >= c.cycle_start::timestamptz), 0) as gastado
      from cycle c
    ),
    final as (
      select x.*, (x.libre - x.gastado) as restante,
        case
          when x.buffer_mode = 'percent' then greatest(0, x.libre / x.dias_ciclo) * greatest(0, 1 - x.buffer_value / 100.0)
          when x.buffer_mode = 'fixed' then greatest(0, greatest(0, x.libre / x.dias_ciclo) - x.buffer_value)
          else greatest(0, x.libre / x.dias_ciclo)
        end as cupo_hoy
      from computed x
    )
    select f.family_id, f.user_id,
      case when f.lang = 'en' then 'Good morning, ' || split_part(btrim(f.display_name), ' ', 1)
           else 'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) end as title,
      case
        when not f.confirmado then
          case when f.lang = 'en' then 'Your payday is here 💸 Confirm your income to see your allowance for the new cycle.'
               else 'Llegó tu cobro 💸 Confirmá tu sueldo para ver tu cupo del nuevo ciclo.' end
        when f.restante > 0 then
          case when f.lang = 'en' then 'Today you have ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999') || ' to spend. $' || to_char(round(f.restante), 'FM999,999,999') || ' left this month.'
               else 'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999') || ' del mes.' end
        else
          case when f.lang = 'en' then 'This month you''re already $' || to_char(round(abs(f.restante)), 'FM999,999,999') || ' over plan. Best today: $0 on extras.'
               else 'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.' end
      end as body,
      'checkin_morning' as kind,
      case when not f.confirmado then 'warning' when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante), 'salary_pending', (not f.confirmado)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || f.today_local::text as dedup_key
    from final f;
  elsif p_kind = 'midday_checkins' then
    return query
    select b.family_id, b.user_id,
      case when b.lang = 'en' then 'Midday' else 'Medio día' end as title,
      case when s.spent_today > 0 then
             case when b.lang = 'en' then 'You''re at $' || to_char(round(s.spent_today), 'FM999,999,999') || ' today. How''s the pace going?'
                  else 'Vas $' || to_char(round(s.spent_today), 'FM999,999,999') || ' hoy. ¿Cómo viene el ritmo?' end
           else
             case when b.lang = 'en' then 'No expenses yet today. Good moment to log anything that came up.'
                  else 'Todavía sin gastos hoy. Buen momento para registrar si algo salió.' end end as body,
      'checkin_midday' as kind, 'info' as severity,
      jsonb_build_object('route', '/', 'spent_today', round(s.spent_today)) as metadata,
      'checkin_midday:' || b.family_id::text || ':' || b.user_id::text || ':' || b.today_local::text as dedup_key
    from (
      select fm.family_id, fm.user_id, coalesce(np.checkin_midday_hour, 14) as pref_hour,
        coalesce(p.preferred_language, 'es') as lang,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      cross join lateral (select public.user_local_timezone(fm.user_id) as user_tz) tz
      where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
        and not ('checkin_midday' = any (coalesce(np.kinds_muted, array[]::text[])))
    ) b
    cross join lateral (
      select coalesce(sum(e.price), 0) as spent_today from public.expenses e
      where e.family_id = b.family_id and e.commitment_id is null and e.archived_at is null
        and (e.created_at at time zone b.user_tz)::date = b.today_local
    ) s
    where b.pref_hour = b.hour_local;
  elsif p_kind = 'evening_checkins' then
    return query
    select b.family_id, b.user_id,
      case when b.lang = 'en' then 'End of day' else 'Cierre del día' end as title,
      case when s.spent_today > 0 then
             case when b.lang = 'en' then 'Today you spent $' || to_char(round(s.spent_today), 'FM999,999,999') || '. Log the last one and keep your streak.'
                  else 'Hoy gastaste $' || to_char(round(s.spent_today), 'FM999,999,999') || '. Anotá lo último y mantené la racha.' end
           else
             case when b.lang = 'en' then 'No expenses logged today. If that''s right, mark it and grow a sprout.'
                  else 'Día sin gastos registrados. Si fue así, marcalo y sumás un brote.' end end as body,
      'checkin_evening' as kind, 'info' as severity,
      jsonb_build_object('route', '/expenses', 'spent_today', round(s.spent_today)) as metadata,
      'checkin_evening:' || b.family_id::text || ':' || b.user_id::text || ':' || b.today_local::text as dedup_key
    from (
      select fm.family_id, fm.user_id, coalesce(np.checkin_evening_hour, 20) as pref_hour,
        coalesce(p.preferred_language, 'es') as lang,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      cross join lateral (select public.user_local_timezone(fm.user_id) as user_tz) tz
      where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
        and not ('checkin_evening' = any (coalesce(np.kinds_muted, array[]::text[])))
    ) b
    cross join lateral (
      select coalesce(sum(e.price), 0) as spent_today from public.expenses e
      where e.family_id = b.family_id and e.commitment_id is null and e.archived_at is null
        and (e.created_at at time zone b.user_tz)::date = b.today_local
    ) s
    where b.pref_hour = b.hour_local;
  elsif p_kind = 'fixed_upcoming' then
    return query
    with members as (
      select fm.family_id, fm.user_id, coalesce(p.preferred_language, 'es') as lang,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      cross join lateral (select public.user_local_timezone(fm.user_id) as user_tz) tz
      where fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
        and not ('fixed_upcoming' = any (coalesce(np.kinds_muted, array[]::text[])))
    ),
    due as (
      select m.family_id, m.user_id, m.lang, m.today_local, fe.id, fe.name, fe.amount, fe.next_due_on,
        row_number() over (partition by m.user_id order by fe.next_due_on, fe.amount desc nulls last) as rn
      from members m
      join public.fixed_expenses fe on fe.family_id = m.family_id and coalesce(fe.status, 'active') = 'active'
      where fe.next_due_on between m.today_local and m.today_local + 1
        or (coalesce(fe.notify_days_before, 0) > 1 and fe.next_due_on = m.today_local + coalesce(fe.notify_days_before, 0))
    ),
    agg as (
      select d.user_id, d.family_id, d.lang, d.today_local, count(*) as cnt, sum(coalesce(d.amount, 0)) as total,
        string_agg(case when d.rn <= 3 then coalesce(nullif(btrim(d.name), ''), 'Compromiso') end, ', ' order by d.rn) as top_names
      from due d group by d.user_id, d.family_id, d.lang, d.today_local
    )
    select d.family_id, d.user_id,
      case when d.lang = 'en' then
        'Fixed expense: ' || coalesce(nullif(btrim(d.name), ''), 'Commitment')
          || ' due ' || (case when d.next_due_on = d.today_local then 'today' when d.next_due_on = d.today_local + 1 then 'tomorrow'
                              else 'in ' || (d.next_due_on - d.today_local) || (case when (d.next_due_on - d.today_local) = 1 then ' day' else ' days' end) end)
      else
        'Gasto fijo: ' || coalesce(nullif(btrim(d.name), ''), 'Compromiso')
          || ' vence ' || (case when d.next_due_on = d.today_local then 'hoy' when d.next_due_on = d.today_local + 1 then 'mañana'
                              else 'en ' || (d.next_due_on - d.today_local) || ' días' end)
      end as title,
      '$' || to_char(round(coalesce(d.amount, 0)), 'FM999,999,999') as body, 'fixed_upcoming' as kind, 'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', d.id, 'amount', d.amount, 'due_on', d.next_due_on) as metadata,
      'fixed_upcoming:' || d.id::text || ':' || d.user_id::text || ':' || d.today_local::text as dedup_key
    from due d join agg a on a.user_id = d.user_id where a.cnt <= 2
    union all
    select a.family_id, a.user_id,
      case when a.lang = 'en' then 'You have ' || a.cnt || ' fixed expenses due soon'
           else 'Tenés ' || a.cnt || ' gastos fijos por vencer' end as title,
      case when a.lang = 'en' then
        a.top_names || (case when a.cnt > 3 then ' and ' || (a.cnt - 3) || ' more' else '' end) || ' · total $' || to_char(round(a.total), 'FM999,999,999')
      else
        a.top_names || (case when a.cnt > 3 then ' y ' || (a.cnt - 3) || ' más' else '' end) || ' · total $' || to_char(round(a.total), 'FM999,999,999')
      end as body,
      'fixed_upcoming' as kind, 'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'count', a.cnt, 'total', a.total) as metadata,
      'fixed_upcoming_digest:' || a.family_id::text || ':' || a.user_id::text || ':' || a.today_local::text as dedup_key
    from agg a where a.cnt > 2;
  end if;
end; $function$;

-- =====================================================================
-- 2) cron_emit_streak_at_risk()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_emit_streak_at_risk()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec record; v_tz text; v_today_local date; v_local_hour integer;
  v_kind text; v_title text; v_body text; v_severity text; v_lang text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.current_streak, us.freeze_tokens, us.last_logged_date,
           coalesce(np.kinds_muted, array[]::text[]) as kinds_muted,
           coalesce(p.preferred_language, 'es') as lang
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    left join public.profiles p on p.id = us.user_id
    where us.current_streak > 0 and us.streak_broken_at is null
      and coalesce(np.nudges_enabled, true) and coalesce(np.channel_inapp, true)
  loop
    begin
      v_lang := v_rec.lang;
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;
      if v_local_hour < 19 or v_local_hour > 21 then continue; end if;
      if v_rec.last_logged_date = v_today_local then continue; end if;
      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint';
        v_title := case when v_lang = 'en' then 'Your garden is waiting 🌱' else 'Tu jardín te espera 🌱' end;
        v_body := case when v_lang = 'en' then 'If you don''t log a movement today, a saved seed will cover the day.'
                       else 'Si hoy no registrás un movimiento, una semilla guardada cubre el día.' end;
        v_severity := 'info';
      else
        v_kind := 'streak_at_risk';
        v_title := case when v_lang = 'en' then 'Your garden is waiting 🌱' else 'Tu jardín te espera 🌱' end;
        v_body := case when v_lang = 'en' then 'Log your day whenever you can and add a sprout to your garden.'
                       else 'Registrá tu día cuando puedas y sumás un brote a tu jardín.' end;
        v_severity := 'info';
      end if;
      if v_kind = any (v_rec.kinds_muted) then continue; end if;
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

-- =====================================================================
-- 3) cron_emit_streak_broken()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_emit_streak_broken()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- =====================================================================
-- 4) cron_emit_streak_recovery_nudge()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_emit_streak_recovery_nudge()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec record; v_tz text; v_today_local date; v_local_hour integer;
  v_days_since integer; v_milestone integer; v_title text; v_body text; v_seed bigint; v_pick integer;
  v_lang text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.longest_streak, us.streak_broken_at,
           coalesce(p.preferred_language, 'es') as lang
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    left join public.profiles p on p.id = us.user_id
    where us.streak_broken_at is not null and us.current_streak = 0
      and us.streak_broken_at > now() - interval '15 days'
      and coalesce(np.nudges_enabled, true) and coalesce(np.channel_inapp, true)
      and not ('streak_recovery_nudge' = any (coalesce(np.kinds_muted, array[]::text[])))
  loop
    begin
      v_lang := v_rec.lang;
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
        if v_lang = 'en' then
          v_title := 'Today is a good day to come back';
          v_body := case v_pick
            when 0 then case when v_rec.longest_streak >= 7
                then 'Your record of ' || v_rec.longest_streak || ' days is still yours. One expense and you start a new streak.'
                else 'A new streak starts with a single log. Today could be that day.' end
            when 1 then 'Log the first thing you spend today and you''re back in. It''s that simple.'
            else 'Yesterday is over. Today you can start day 1 of your next record.' end;
        else
          v_title := 'Hoy es buen día para volver';
          v_body := case v_pick
            when 0 then case when v_rec.longest_streak >= 7
                then 'Tu marca de ' || v_rec.longest_streak || ' días sigue tuya. Un gasto y arrancás otra racha.'
                else 'Una racha nueva empieza con un solo registro. Hoy puede ser ese día.' end
            when 1 then 'Anotá lo primero que gastés hoy y volvés al ruedo. Es así de simple.'
            else 'Ayer pasó. Hoy podés arrancar el día 1 de tu próximo récord.' end;
        end if;
      elsif v_milestone = 3 then
        if v_lang = 'en' then
          v_title := 'Three days without logging';
          v_body := case v_pick
            when 0 then 'Coming back is easier than keeping it up — a single movement and you restart the streak.'
            when 1 then 'A coffee, an errand, whatever. Just one expense to start again.'
            else 'No need to wait for Monday. You can come back today.' end;
        else
          v_title := 'Tres días sin registrar';
          v_body := case v_pick
            when 0 then 'Volver es más fácil que mantener — un solo movimiento y reactivás la racha.'
            when 1 then 'Un café, un mandado, lo que sea. Basta con un gasto para arrancar de nuevo.'
            else 'No hace falta esperar al lunes. Podés volver hoy mismo.' end;
        end if;
      elsif v_milestone = 7 then
        if v_lang = 'en' then
          v_title := 'A week — but you''re still on time';
          v_body := case v_pick
            when 0 then 'Your account is still here waiting. Log an expense today and you''re back in the game.'
            when 1 then case when v_rec.longest_streak >= 14
                then 'You once reached ' || v_rec.longest_streak || ' days. You can do it again.'
                else 'Don''t look at what happened — look at what''s coming. Today is day 1.' end
            else 'Sometimes the best streak starts after a pause. Give it a try today.' end;
        else
          v_title := 'Una semana — pero todavía estás a tiempo';
          v_body := case v_pick
            when 0 then 'Tu cuenta sigue acá esperando. Un gasto registrado hoy y volvés al juego.'
            when 1 then case when v_rec.longest_streak >= 14
                then 'Llegaste a ' || v_rec.longest_streak || ' días una vez. Podés volver a hacerlo.'
                else 'No mires lo que pasó — mirá lo que viene. Hoy es el día 1.' end
            else 'A veces la mejor racha empieza después de una pausa. Probá hoy.' end;
        end if;
      else
        if v_lang = 'en' then
          v_title := 'One last note before letting go';
          v_body := case v_pick
            when 0 then case when v_rec.longest_streak >= 14
                then 'Your ' || v_rec.longest_streak || ' days are still a record. If you want to come back, today is a good time.'
                else 'If you want to pick the habit back up, today is a good time. We won''t insist anymore.' end
            when 1 then 'If you come back at some point, it''ll be day 1 of something new. We''ll leave you in peace for now.'
            else 'This is the last one. If you return, we''ll celebrate. If not, that''s fine too.' end;
        else
          v_title := 'Última nota antes de soltar';
          v_body := case v_pick
            when 0 then case when v_rec.longest_streak >= 14
                then 'Tus ' || v_rec.longest_streak || ' días siguen siendo récord. Si querés volver, hoy es buen momento.'
                else 'Si querés retomar el hábito, hoy es buen momento. No te vamos a insistir más.' end
            when 1 then 'Si volvés en algún momento, va a ser el día 1 de algo nuevo. Te dejamos en paz por ahora.'
            else 'Esta es la última. Si retomás, lo celebramos. Si no, también.' end;
        end if;
      end if;
      perform public.emit_notification(v_rec.family_id, v_rec.user_id, v_title, v_body,
        'streak_recovery_nudge', 'info', null,
        jsonb_build_object('route', '/expenses', 'nudge_day', v_milestone, 'longest_streak', v_rec.longest_streak));
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $function$;

-- =====================================================================
-- 5) cron_emit_weekly_insights()  (goal_behind)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_emit_weekly_insights()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            v_meta := jsonb_build_object('route', '/savings-goal', 'goal_id', v_goal.id,
              'contribution', v_contrib_this_cycle, 'target_pace', v_target_pace);
            for v_member in
              select fm.user_id, coalesce(np.kinds_muted, array[]::text[]) as kinds_muted,
                coalesce(p.preferred_language, 'es') as lang
              from public.family_members fm
              left join public.notification_preferences np on np.user_id = fm.user_id
              left join public.profiles p on p.id = fm.user_id
              where fm.family_id = v_fam.family_id and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
            loop
              if 'goal_behind' = any (v_member.kinds_muted) then continue; end if;
              if exists (
                select 1 from public.notifications n
                where n.family_id = v_fam.family_id and n.user_id = v_member.user_id and n.kind = 'goal_behind'
                  and (n.metadata ->> 'goal_id') = v_goal.id::text
                  and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
              ) then continue; end if;
              if v_member.lang = 'en' then
                v_title := 'You''re behind on ' || v_goal.title;
                v_body := 'This cycle you contributed $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
                  || ' · suggested pace $' || to_char(round(v_target_pace), 'FM999,999,999') || '/month.';
              else
                v_title := 'Vas atrasado con ' || v_goal.title;
                v_body := 'Este ciclo aportaste $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
                  || ' · ritmo sugerido $' || to_char(round(v_target_pace), 'FM999,999,999') || '/mes.';
              end if;
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
