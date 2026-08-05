-- WHAT: Los check-ins (morning/midday/evening) filtraban por hora/fecha de
--       ARGENTINA hardcodeada. Un usuario de Colombia que setea 14h recibiría a
--       las 14h AR = 12h Colombia. Fix: usar la zona horaria de CADA usuario
--       (`user_local_timezone(user_id)` = profiles.timezone, default AR) para la
--       hora del filtro Y la fecha "hoy" (ventana de gasto + ciclo + dedup).
-- WHY:  Las notis deben atraparse en la tz real del usuario. Las rachas ya lo
--       hacen (loop per-usuario con user_local_timezone); los check-ins no.
-- NOTE: El cron corre cada hora (UTC); la función devuelve solo los usuarios cuya
--       hora LOCAL coincide con su preferencia. dedup_key por fecha local.

create or replace function public.list_pending_notifications(p_kind text)
 returns table(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    with base as (
      select fm.family_id, fm.user_id, coalesce(p.display_name, 'vos') as display_name,
        ff.monthly_income, coalesce(ff.salary_payment_day, 1) as salary_day, coalesce(ff.savings_goal, 0) as savings_goal,
        ff.last_salary_confirmed_at,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode, coalesce(ff.daily_budget_buffer_value, 0) as buffer_value,
        coalesce(np.checkin_morning_hour, 9) as pref_hour,
        tz.user_tz,
        (now() at time zone tz.user_tz)::date as today_local,
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
    select f.family_id, f.user_id, 'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) as title,
      case
        when not f.confirmado then 'Llegó tu cobro 💸 Confirmá tu sueldo para ver tu cupo del nuevo ciclo.'
        when f.restante > 0 then 'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999') || ' del mes.'
        else 'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.'
      end as body,
      'checkin_morning' as kind,
      case when not f.confirmado then 'warning' when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante), 'salary_pending', (not f.confirmado)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || f.today_local::text as dedup_key
    from final f;

  elsif p_kind = 'midday_checkins' then
    return query
    select b.family_id, b.user_id, 'Medio día' as title,
      case when s.spent_today > 0 then 'Vas $' || to_char(round(s.spent_today), 'FM999,999,999') || ' hoy. ¿Cómo viene el ritmo?'
           else 'Todavía sin gastos hoy. Buen momento para registrar si algo salió.' end as body,
      'checkin_midday' as kind, 'info' as severity,
      jsonb_build_object('route', '/', 'spent_today', round(s.spent_today)) as metadata,
      'checkin_midday:' || b.family_id::text || ':' || b.user_id::text || ':' || b.today_local::text as dedup_key
    from (
      select fm.family_id, fm.user_id, coalesce(np.checkin_midday_hour, 14) as pref_hour,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
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
    select b.family_id, b.user_id, 'Cierre del día' as title,
      case when s.spent_today > 0 then 'Hoy gastaste $' || to_char(round(s.spent_today), 'FM999,999,999') || '. Anotá lo último y mantené la racha.'
           else 'Día sin gastos registrados. Si fue así, marcalo y sumás un brote.' end as body,
      'checkin_evening' as kind, 'info' as severity,
      jsonb_build_object('route', '/expenses', 'spent_today', round(s.spent_today)) as metadata,
      'checkin_evening:' || b.family_id::text || ':' || b.user_id::text || ':' || b.today_local::text as dedup_key
    from (
      select fm.family_id, fm.user_id, coalesce(np.checkin_evening_hour, 20) as pref_hour,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
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
