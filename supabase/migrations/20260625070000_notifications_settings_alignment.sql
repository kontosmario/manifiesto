-- WHAT: Alinea las notificaciones de cron con la config de settings del usuario.
--   (1) HORARIOS: el usuario elige checkin_morning/midday/evening_hour, pero los
--       crons corrían a hora FIJA y list_pending_notifications NO filtraba por la
--       hora → el picker era decorativo. Fix: filtrar cada check-in por
--       checkin_X_hour == hora AR actual + reprogramar los crons a HORARIO (cada
--       hora dispara; la función devuelve solo los usuarios de esa hora).
--   (2) midday ACTIVADO (no tenía cron) + midday/evening con números REALES
--       (gasto del día) en vez de copy genérico.
--   (3) cycle_closed → modelo de SOBRANTE (ingreso + extra − gasto − ahorro
--       comprometido), no savings_delta (que no resta el ahorro ni suma extra).
-- Fase 2 (pendiente): kinds_muted/nudges_enabled para notis SQL-cron broadcast.

-- ── (1)(2) check-ins por hora + números reales ──────────────────────────────
create or replace function public.list_pending_notifications(p_kind text)
 returns table(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hour_ar  int  := extract(hour from (now() at time zone 'America/Argentina/Buenos_Aires'))::int;
begin
  if p_kind = 'morning_checkins' then
    return query
    with member as (
      select fm.family_id, fm.user_id, coalesce(p.display_name, 'vos') as display_name,
        ff.monthly_income, coalesce(ff.salary_payment_day, 1) as salary_day, coalesce(ff.savings_goal, 0) as savings_goal,
        ff.last_salary_confirmed_at,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode, coalesce(ff.daily_budget_buffer_value, 0) as buffer_value
      from public.family_members fm join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
        and not ('checkin_morning' = any (coalesce(np.kinds_muted, array[]::text[])))
        and coalesce(np.checkin_morning_hour, 9) = v_hour_ar
    ),
    cycle as (
      select m.*,
        case when extract(day from v_today_ar)::int >= least(m.salary_day,
            extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int)
          then make_date(extract(year from v_today_ar)::int, extract(month from v_today_ar)::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int))
          else make_date(extract(year from (v_today_ar - interval '1 month'))::int, extract(month from (v_today_ar - interval '1 month'))::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) - interval '1 day'))::int))
        end as cycle_start
      from member m
    ),
    computed as (
      select c.*, (c.cycle_start + interval '1 month')::date as cycle_end,
        greatest(1, ((c.cycle_start + interval '1 month')::date - c.cycle_start)) as dias_ciclo,
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
    select f.family_id, f.user_id, 'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) as title,
      case
        when not f.confirmado then 'Llegó tu cobro 💸 Confirmá tu sueldo para ver tu cupo del nuevo ciclo.'
        when f.restante > 0 then 'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999') || ' del mes.'
        else 'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.'
      end as body,
      'checkin_morning' as kind,
      case when not f.confirmado then 'warning' when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante), 'salary_pending', (not f.confirmado)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || v_today_ar::text as dedup_key
    from final f;

  elsif p_kind = 'midday_checkins' then
    return query
    select fm.family_id, fm.user_id, 'Medio día' as title,
      case when v_spent_today > 0
        then 'Vas $' || to_char(round(v_spent_today), 'FM999,999,999') || ' hoy. ¿Cómo viene el ritmo?'
        else 'Todavía sin gastos hoy. Buen momento para registrar si algo salió.'
      end as body,
      'checkin_midday' as kind, 'info' as severity,
      jsonb_build_object('route', '/', 'spent_today', round(v_spent_today)) as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    cross join lateral (
      select coalesce(sum(e.price), 0) as v_spent_today
      from public.expenses e
      where e.family_id = fm.family_id and e.commitment_id is null and e.archived_at is null
        and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today_ar
    ) s
    where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
      and not ('checkin_midday' = any (coalesce(np.kinds_muted, array[]::text[])))
      and coalesce(np.checkin_midday_hour, 14) = v_hour_ar;

  elsif p_kind = 'evening_checkins' then
    return query
    select fm.family_id, fm.user_id, 'Cierre del día' as title,
      case when v_spent_today > 0
        then 'Hoy gastaste $' || to_char(round(v_spent_today), 'FM999,999,999') || '. Anotá lo último y mantené la racha.'
        else 'Día sin gastos registrados. Si fue así, marcalo y sumás un brote.'
      end as body,
      'checkin_evening' as kind, 'info' as severity,
      jsonb_build_object('route', '/expenses', 'spent_today', round(v_spent_today)) as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    cross join lateral (
      select coalesce(sum(e.price), 0) as v_spent_today
      from public.expenses e
      where e.family_id = fm.family_id and e.commitment_id is null and e.archived_at is null
        and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today_ar
    ) s
    where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
      and not ('checkin_evening' = any (coalesce(np.kinds_muted, array[]::text[])))
      and coalesce(np.checkin_evening_hour, 20) = v_hour_ar;

  elsif p_kind = 'fixed_upcoming' then
    return query
    with due as (
      select fe.family_id, fe.id, fe.name, fe.amount, fe.next_due_on,
        row_number() over (partition by fe.family_id order by fe.next_due_on, fe.amount desc nulls last) as rn
      from public.fixed_expenses fe
      where coalesce(fe.status, 'active') = 'active'
        and (fe.next_due_on between v_today_ar and v_today_ar + 1
          or (coalesce(fe.notify_days_before, 0) > 1 and fe.next_due_on = v_today_ar + coalesce(fe.notify_days_before, 0)))
    ),
    agg as (
      select d.family_id, count(*) as cnt, sum(coalesce(d.amount, 0)) as total,
        string_agg(case when d.rn <= 3 then coalesce(nullif(btrim(d.name), ''), 'Compromiso') end, ', ' order by d.rn) as top_names
      from due d group by d.family_id
    )
    select d.family_id, null::uuid as user_id,
      'Gasto fijo: ' || coalesce(nullif(btrim(d.name), ''), 'Compromiso')
        || ' vence ' || (case when d.next_due_on = v_today_ar then 'hoy' when d.next_due_on = v_today_ar + 1 then 'mañana'
                              else 'en ' || (d.next_due_on - v_today_ar) || ' días' end) as title,
      '$' || to_char(round(coalesce(d.amount, 0)), 'FM999,999,999') as body, 'fixed_upcoming' as kind, 'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', d.id, 'amount', d.amount, 'due_on', d.next_due_on) as metadata,
      'fixed_upcoming:' || d.id::text || ':' || v_today_ar::text as dedup_key
    from due d join agg a on a.family_id = d.family_id where a.cnt <= 2
    union all
    select a.family_id, null::uuid as user_id, 'Tenés ' || a.cnt || ' gastos fijos por vencer' as title,
      a.top_names || (case when a.cnt > 3 then ' y ' || (a.cnt - 3) || ' más' else '' end) || ' · total $' || to_char(round(a.total), 'FM999,999,999') as body,
      'fixed_upcoming' as kind, 'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'count', a.cnt, 'total', a.total) as metadata,
      'fixed_upcoming_digest:' || a.family_id::text || ':' || v_today_ar::text as dedup_key
    from agg a where a.cnt > 2;
  end if;
end; $function$;

-- ── (3) cycle_closed: modelo de sobrante (no savings_delta) ──────────────────
create or replace function public.notify_cycle_closed()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_member record;
  v_severity text;
  v_title text;
  v_body text;
  v_top_cat text;
  v_top_cat_amt numeric;
  v_sobrante numeric;
begin
  if coalesce(new.total_variable_spent, 0) <= 0 and coalesce(new.total_spent, 0) <= 0 then
    return new;
  end if;

  -- Sobrante REAL del ciclo = ingreso + extra − gasto − ahorro comprometido.
  -- (Antes usaba savings_delta = income − spent, que no resta el ahorro ni suma
  -- el extra → sobre-estimaba "lo que guardaste". Espejo del modelo del app.)
  v_sobrante := coalesce(new.monthly_income, 0)
    + coalesce(new.extra_income, 0)
    - coalesce(new.total_spent, 0)
    - coalesce(new.savings_goal_amount, 0);

  v_severity := case
    when new.mood = 'red' then 'warning'
    when new.mood = 'yellow' then 'info'
    when new.mood = 'green' then 'success'
    else 'info'
  end;

  if new.category_breakdown is not null then
    select e.value->>'name', (e.value->>'total')::numeric
    into v_top_cat, v_top_cat_amt
    from jsonb_array_elements(new.category_breakdown) as e(value)
    order by (e.value->>'total')::numeric desc nulls last
    limit 1;
  end if;

  v_title := 'Cerró ' || coalesce(new.period_label, to_char(new.period_start, 'TMMonth YYYY'));
  v_body := case
    when v_sobrante > 0 then
      'Te sobró $' || to_char(round(v_sobrante), 'FM999G999G999')
        || coalesce(' · ' || v_top_cat || ' fue tu top', '')
    when v_sobrante < 0 then
      'Te pasaste $' || to_char(round(abs(v_sobrante)), 'FM999G999G999') || ' del plan'
        || coalesce(' · ' || v_top_cat || ' pesó más', '')
    else
      coalesce(v_top_cat || ' fue tu top', 'Cerró el ciclo.')
  end;

  for v_member in
    select fm.user_id from public.family_members fm
    where fm.family_id = new.family_id and fm.role <> 'blocked'
  loop
    if not exists (
      select 1 from public.notifications n
      where n.family_id = new.family_id and n.user_id = v_member.user_id
        and n.kind = 'cycle_closed' and n.metadata->>'period_start' = new.period_start::text
    ) then
      perform public.emit_notification(
        new.family_id, v_member.user_id, v_title, v_body, 'cycle_closed', v_severity, null,
        jsonb_build_object(
          'period_start', new.period_start, 'period_end', new.period_end, 'period_label', new.period_label,
          'mood', new.mood, 'sobrante', round(v_sobrante),
          'total_variable_spent', new.total_variable_spent,
          'top_category_name', v_top_cat, 'top_category_amount', v_top_cat_amt,
          'route', '/(app)/(tabs)/control'
        )
      );
    end if;
  end loop;
  return new;
end; $function$;

-- ── Reprogramar los crons de check-in a HORARIO (cada hora; la función filtra
--    al usuario cuya hora preferida coincide). Activa midday. cron.schedule por
--    nombre = update idempotente. ──────────────────────────────────────────────
select cron.schedule('notifications-morning', '0 * * * *', $$select public.dispatch_notifications_kind('morning_checkins');$$);
select cron.schedule('notifications-midday',  '0 * * * *', $$select public.dispatch_notifications_kind('midday_checkins');$$);
select cron.schedule('notifications-evening', '0 * * * *', $$select public.dispatch_notifications_kind('evening_checkins');$$);
