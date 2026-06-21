-- Consolidación anti-spam: fijos por vencer en 1 digest cuando son >2.
--
-- Antes: list_pending_notifications('fixed_upcoming') devolvía 1 fila por
-- fijo → N fijos venciendo = N push seguidas. Ahora: si una familia tiene
-- >2 fijos venciendo, emite UNA fila digest ("Tenés N gastos fijos por
-- vencer · X, Y, Z y N-3 más · total $…"). 1-2 fijos siguen individuales.
--
-- CREATE OR REPLACE de list_pending_notifications: cuerpo idéntico a
-- 20260620170000 salvo la rama fixed_upcoming. Plan:
-- docs/superpowers/plans/2026-06-21-push-notification-consolidation.md

CREATE OR REPLACE FUNCTION public.list_pending_notifications(p_kind text)
 RETURNS TABLE(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    with member as (
      select
        fm.family_id,
        fm.user_id,
        coalesce(p.display_name, 'vos') as display_name,
        ff.monthly_income,
        coalesce(ff.salary_payment_day, 1) as salary_day,
        coalesce(ff.savings_goal, 0) as savings_goal,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode,
        coalesce(ff.daily_budget_buffer_value, 0) as buffer_value
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      where coalesce(ff.monthly_income, 0) > 0
        and fm.role <> 'blocked'
        and coalesce(np.channel_inapp, true)
        and not ('checkin_morning' = any (coalesce(np.kinds_muted, array[]::text[])))
    ),
    cycle as (
      select
        m.*,
        -- Inicio del ciclo: el salary_day más reciente (clampeado al
        -- último día del mes corto). Mismo algoritmo que la velocity fn.
        case
          when extract(day from v_today_ar)::int >= least(
            m.salary_day,
            extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int
          )
          then make_date(
            extract(year from v_today_ar)::int,
            extract(month from v_today_ar)::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) + interval '1 month' - interval '1 day'))::int)
          )
          else make_date(
            extract(year from (v_today_ar - interval '1 month'))::int,
            extract(month from (v_today_ar - interval '1 month'))::int,
            least(m.salary_day, extract(day from (date_trunc('month', v_today_ar) - interval '1 day'))::int)
          )
        end as cycle_start
      from member m
    ),
    computed as (
      select
        c.*,
        (c.cycle_start + interval '1 month')::date as cycle_end,
        greatest(1, ((c.cycle_start + interval '1 month')::date - v_today_ar)) as dias_restantes,
        greatest(0,
          c.monthly_income
          -- Ingresos extra del ciclo (income_events): misma ventana
          -- half-open que el cliente. Antes ignorados — el checkin
          -- contradecía el disponible del Home.
          + coalesce((
              select sum(ie.amount)
              from public.income_events ie
              where ie.family_id = c.family_id
                and ie.event_date >= c.cycle_start
                and ie.event_date < (c.cycle_start + interval '1 month')::date
            ), 0)
          - coalesce((
              select sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency))
              from public.fixed_expenses fe
              where fe.family_id = c.family_id
                and coalesce(fe.status, 'active') = 'active'
            ), 0)
          - c.savings_goal
        ) as libre,
        coalesce((
          select sum(e.price)
          from public.expenses e
          where e.family_id = c.family_id
            and e.archived_at is null
            and e.commitment_id is null
            and e.created_at >= c.cycle_start::timestamptz
        ), 0) as gastado
      from cycle c
    ),
    final as (
      select
        x.*,
        (x.libre - x.gastado) as restante,
        -- Cupo de hoy: restante repartido en los días que quedan, con
        -- el buffer del usuario aplicado (espejo del Home).
        case
          when x.buffer_mode = 'percent'
            then greatest(0, (x.libre - x.gastado) / x.dias_restantes) * greatest(0, 1 - x.buffer_value / 100.0)
          when x.buffer_mode = 'fixed'
            then greatest(0, greatest(0, (x.libre - x.gastado) / x.dias_restantes) - x.buffer_value)
          else greatest(0, (x.libre - x.gastado) / x.dias_restantes)
        end as cupo_hoy
      from computed x
    )
    select
      f.family_id,
      f.user_id,
      'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) as title,
      case
        when f.restante > 0 then
          'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999')
            || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999')
            || ' del mes.'
        else
          'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999')
            || ' arriba del plan. Hoy ideal: $0 en gustos.'
      end as body,
      'checkin_morning' as kind,
      case when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || v_today_ar::text as dedup_key
    from final f;

  elsif p_kind = 'midday_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Medio día' as title,
      'Pasá por la app y revisá cómo vas hoy.' as body,
      'checkin_midday' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked'
      and coalesce(np.channel_inapp, true)
      and not ('checkin_midday' = any (coalesce(np.kinds_muted, array[]::text[])));

  elsif p_kind = 'evening_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Cierre del día' as title,
      'Anotá lo último de hoy y mantené la racha.' as body,
      'checkin_evening' as kind,
      'info' as severity,
      jsonb_build_object('route', '/expenses') as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked'
      and coalesce(np.channel_inapp, true)
      and not ('checkin_evening' = any (coalesce(np.kinds_muted, array[]::text[])));

  elsif p_kind = 'fixed_upcoming' then
    -- Consolidación: 1-2 fijos venciendo → 1 fila por fijo (copy actual);
    -- >2 → UNA fila digest por familia (anti-spam).
    return query
    with due as (
      select
        fe.family_id, fe.id, fe.name, fe.amount, fe.next_due_on,
        row_number() over (
          partition by fe.family_id
          order by fe.next_due_on, fe.amount desc nulls last
        ) as rn
      from public.fixed_expenses fe
      where coalesce(fe.status, 'active') = 'active'
        and (
          fe.next_due_on between v_today_ar and v_today_ar + 1
          or (
            coalesce(fe.notify_days_before, 0) > 1
            and fe.next_due_on = v_today_ar + coalesce(fe.notify_days_before, 0)
          )
        )
    ),
    agg as (
      select
        d.family_id,
        count(*) as cnt,
        sum(coalesce(d.amount, 0)) as total,
        string_agg(
          case when d.rn <= 3 then coalesce(nullif(btrim(d.name), ''), 'Compromiso') end,
          ', ' order by d.rn
        ) as top_names
      from due d
      group by d.family_id
    )
    -- 1-2 fijos: individual
    select
      d.family_id,
      null::uuid as user_id,
      'Gasto fijo: ' || coalesce(nullif(btrim(d.name), ''), 'Compromiso')
        || ' vence ' || (case when d.next_due_on = v_today_ar then 'hoy'
                              when d.next_due_on = v_today_ar + 1 then 'mañana'
                              else 'en ' || (d.next_due_on - v_today_ar) || ' días' end) as title,
      '$' || to_char(round(coalesce(d.amount, 0)), 'FM999,999,999') as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', d.id, 'amount', d.amount, 'due_on', d.next_due_on) as metadata,
      'fixed_upcoming:' || d.id::text || ':' || v_today_ar::text as dedup_key
    from due d
    join agg a on a.family_id = d.family_id
    where a.cnt <= 2
    union all
    -- >2 fijos: UN digest por familia
    select
      a.family_id,
      null::uuid as user_id,
      'Tenés ' || a.cnt || ' gastos fijos por vencer' as title,
      a.top_names
        || (case when a.cnt > 3 then ' y ' || (a.cnt - 3) || ' más' else '' end)
        || ' · total $' || to_char(round(a.total), 'FM999,999,999') as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'count', a.cnt, 'total', a.total) as metadata,
      'fixed_upcoming_digest:' || a.family_id::text || ':' || v_today_ar::text as dedup_key
    from agg a
    where a.cnt > 2;

  end if;
end;
$function$
;
