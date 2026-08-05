-- Cron "Buen día" ↔ disponible del Home — paridad.
--
-- Problema: el push checkin_morning calculaba el cupo/saldo con una fórmula
-- propia (monthly_income / días TOTALES, ignorando el override de saldo de
-- ciclo) que derivó del disponible que el usuario ve en el Home. Para una
-- cuenta con override activo el push decía 172.902 mientras el Home mostraba
-- ~256.008.
--
-- Fix: una función canónica `cycle_disponible(family, as_of)` que espeja 1:1
-- el cálculo del Home (family-dashboard-model + use-home-metrics + el TS puro
-- `computeCycleDisponible`). El cron la consume. Verificada contra datos
-- reales (familia 61bdc187 → 256.008; 3d7f2031 → 0) y por el parity test
-- `tests/integration/cycle-disponible-parity.test.ts`.
--
-- Decisión deliberada: NO aplica `buffer` (el hero del Home tampoco; el buffer
-- vive solo en el daily-budget-engine de la pantalla Gastos). Usuarios con
-- buffer dejan de verlo descontado en el push → el push pasa a == el Home.

-- =====================================================================
-- 1) public.cycle_disponible(p_family_id, p_as_of)
-- =====================================================================
create or replace function public.cycle_disponible(p_family_id uuid, p_as_of date)
 returns table(daily_budget numeric, available_today numeric, raw_cycle_balance numeric, has_override boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with f as (
    select ff.monthly_income::numeric as monthly_income,
           coalesce(ff.salary_payment_day, 1) as salary_day,
           coalesce(ff.savings_goal, 0)::numeric as savings_goal,
           coalesce(ff.savings_goal_percent, 0)::numeric as savings_goal_percent,
           ff.current_cycle_anchor,
           ff.current_cycle_starting_balance::numeric as starting_balance
    from public.family_finance ff
    where ff.family_id = p_family_id
  ),
  -- Inicio de ciclo desde salary_payment_day (misma lógica que el cron y que
  -- `computeMonthlyAccountingWindow` para monthly).
  cyc as (
    select f.*,
      case when extract(day from p_as_of)::int >= least(f.salary_day,
          extract(day from (date_trunc('month', p_as_of) + interval '1 month' - interval '1 day'))::int)
        then make_date(extract(year from p_as_of)::int, extract(month from p_as_of)::int,
          least(f.salary_day, extract(day from (date_trunc('month', p_as_of) + interval '1 month' - interval '1 day'))::int))
        else make_date(extract(year from (p_as_of - interval '1 month'))::int, extract(month from (p_as_of - interval '1 month'))::int,
          least(f.salary_day, extract(day from (date_trunc('month', p_as_of) - interval '1 day'))::int))
      end as cycle_start
    from f
  ),
  win as (
    select c.*, (c.cycle_start + interval '1 month')::date as cycle_end,
      greatest(1, ((c.cycle_start + interval '1 month')::date - c.cycle_start))::int as days,
      greatest(1, ceil((((c.cycle_start + interval '1 month')::date - p_as_of))::numeric))::int as days_remaining
    from cyc c
  ),
  -- pressureTotal = paid_in_cycle + reserved (per-occurrence, due-this-cycle).
  -- Espeja computeFixedExpenseCycleSummary. LEFT JOIN → 1 fila aun sin fijos.
  press as (
    select
      coalesce(sum(case when fx.id is not null then pic.paid else 0 end), 0) as paid_total,
      coalesce(sum(case when fx.status = 'active' and fx.next_due_on is not null and fx.next_due_on < w.cycle_end
        then greatest(0,
          (case when fx.kind = 'debt' and fx.remaining_balance is not null
                then greatest(0, least(fx.amount, fx.remaining_balance))
                else greatest(0, fx.amount) end) - pic.paid)
        else 0 end), 0) as reserved_total
    from win w
    left join public.fixed_expenses fx on fx.family_id = p_family_id
    left join lateral (
      select coalesce((select sum(e.price) from public.expenses e
        where e.commitment_id = fx.id
          and e.created_at >= w.cycle_start::timestamptz
          and e.created_at < w.cycle_end::timestamptz), 0) as paid
    ) pic on true
  ),
  spend as (
    select
      coalesce((select sum(e.price) from public.expenses e
        where e.family_id = p_family_id and e.archived_at is null and e.commitment_id is null
          and e.created_at >= w.cycle_start::timestamptz and e.created_at < w.cycle_end::timestamptz), 0) as var_cycle,
      coalesce((select sum(e.price) from public.expenses e
        where e.family_id = p_family_id and e.archived_at is null and e.commitment_id is null
          and e.created_at >= p_as_of::timestamptz and e.created_at < w.cycle_end::timestamptz), 0) as var_since_today,
      coalesce((select sum(ie.amount) from public.income_events ie
        where ie.family_id = p_family_id and ie.event_date >= w.cycle_start and ie.event_date < w.cycle_end), 0) as extra_income
    from win w
  ),
  calc as (
    select w.monthly_income, w.days, w.days_remaining, w.savings_goal, w.savings_goal_percent,
      (w.current_cycle_anchor = w.cycle_start and w.starting_balance is not null and w.starting_balance >= 0) as ov,
      w.starting_balance, (p.paid_total + p.reserved_total) as pressure,
      s.var_cycle, s.var_since_today, s.extra_income
    from win w, press p, spend s
  ),
  res as (
    select c.*,
      case when c.ov then c.starting_balance else c.monthly_income end as eff_income,
      case when c.ov then greatest(1, c.days_remaining) else greatest(1, c.days) end as eff_days,
      (c.ov and c.starting_balance < c.monthly_income) as ov_down
    from calc c
  ),
  res2 as (
    select r.*,
      case when r.ov_down then greatest(1, r.days_remaining)::numeric / greatest(1, r.days) else 1 end as proration,
      case when r.ov_down then greatest(0, round(r.eff_income * (r.savings_goal_percent / 100))) else r.savings_goal end as eff_savings,
      case when r.ov then r.var_since_today else r.var_cycle end as var_metrics
    from res r
  )
  select
    greatest(0, round(greatest(0, round(r.eff_income - r.pressure - r.eff_savings)) / greatest(1, r.eff_days)))::numeric as daily_budget,
    greatest(0, round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income))::numeric as available_today,
    round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income)::numeric as raw_cycle_balance,
    r.ov as has_override
  from res2 r;
$function$;

-- Lectura de datos cross-familia + SECURITY DEFINER → nunca exponer al cliente.
-- Solo la llama list_pending_notifications (SECURITY DEFINER, corre como owner).
revoke all on function public.cycle_disponible(uuid, date) from public;
revoke all on function public.cycle_disponible(uuid, date) from anon;
revoke all on function public.cycle_disponible(uuid, date) from authenticated;

-- =====================================================================
-- 2) list_pending_notifications — rama morning_checkins consume cycle_disponible
--    (las demás ramas quedan byte-for-byte iguales).
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
        coalesce(ff.salary_payment_day, 1) as salary_day,
        ff.last_salary_confirmed_at,
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
    -- Cupo/saldo CANÓNICOS — misma cuenta que el Home (cycle_disponible).
    final as (
      select c.family_id, c.user_id, c.display_name, c.lang, c.today_local,
        (c.last_salary_confirmed_at is not null and c.last_salary_confirmed_at >= c.cycle_start::timestamptz) as confirmado,
        d.daily_budget, d.available_today, d.raw_cycle_balance
      from cycle c
      cross join lateral public.cycle_disponible(c.family_id, c.today_local) d
    )
    select f.family_id, f.user_id,
      case when f.lang = 'en' then 'Good morning, ' || split_part(btrim(f.display_name), ' ', 1)
           else 'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) end as title,
      case
        when not f.confirmado then
          case when f.lang = 'en' then 'Your payday is here 💸 Confirm your income to see your allowance for the new cycle.'
               else 'Llegó tu cobro 💸 Confirmá tu sueldo para ver tu cupo del nuevo ciclo.' end
        when f.raw_cycle_balance > 0 then
          case when f.lang = 'en' then 'Today you have ~$' || to_char(round(f.daily_budget), 'FM999,999,999') || ' to spend. $' || to_char(round(f.available_today), 'FM999,999,999') || ' left this month.'
               else 'Hoy tenés ~$' || to_char(round(f.daily_budget), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.available_today), 'FM999,999,999') || ' del mes.' end
        else
          case when f.lang = 'en' then 'This month you''re already $' || to_char(round(abs(f.raw_cycle_balance)), 'FM999,999,999') || ' over plan. Best today: $0 on extras.'
               else 'Este mes ya vas $' || to_char(round(abs(f.raw_cycle_balance)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.' end
      end as body,
      'checkin_morning' as kind,
      case when not f.confirmado then 'warning' when f.raw_cycle_balance > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.daily_budget), 'restante', round(f.available_today), 'salary_pending', (not f.confirmado)) as metadata,
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
