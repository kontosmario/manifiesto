-- ════════════════════════════════════════════════════════════════════
-- Modo INGRESO DINÁMICO — superficies server restantes.
--
-- Complementa 20260708130000 (columna income_mode + cycle_disponible dyn):
--   1. `list_pending_notifications`: los check-ins (morning/midday/evening)
--      gateaban por monthly_income > 0 → un hogar dinámico no recibía
--      NINGÚN check-in y el flag `dyn` de cycle_disponible era código
--      muerto. Ahora dinámico también entra, y el branch "Confirmá tu
--      sueldo" del morning no aplica (dinámico = siempre confirmado).
--   2. `cron_compute_velocity_snapshots`: v_eff_income ignoraba los
--      income_events → dinámico quedaba stress='critical' para siempre
--      (y el asistente lo leía crudo vía home_snapshot.velocity_today).
--      Ahora suma los ingresos del ciclo y no resta el ahorro por %.
-- ════════════════════════════════════════════════════════════════════

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
        coalesce(ff.income_mode, 'fixed') as income_mode,
        coalesce(np.checkin_morning_hour, 9) as pref_hour,
        tz.user_tz, (now() at time zone tz.user_tz)::date as today_local,
        extract(hour from (now() at time zone tz.user_tz))::int as hour_local
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      cross join lateral (select public.user_local_timezone(fm.user_id) as user_tz) tz
      where (coalesce(ff.monthly_income, 0) > 0 or coalesce(ff.income_mode, 'fixed') = 'dynamic') and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
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
        (c.income_mode = 'dynamic' or (c.last_salary_confirmed_at is not null and c.last_salary_confirmed_at >= c.cycle_start::timestamptz)) as confirmado,
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
      where (coalesce(ff.monthly_income, 0) > 0 or coalesce(ff.income_mode, 'fixed') = 'dynamic') and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
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
      where (coalesce(ff.monthly_income, 0) > 0 or coalesce(ff.income_mode, 'fixed') = 'dynamic') and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
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

-- ─── velocity snapshots: ingreso real del ciclo en dinámico ───

CREATE OR REPLACE FUNCTION public.cron_compute_velocity_snapshots()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_now   timestamptz := (v_today + interval '0 hours') at time zone 'America/Argentina/Buenos_Aires';
  v_rec record;
  v_payment_day int;
  v_cycle_start timestamptz;
  v_cycle_end   timestamptz;
  v_cycle_days  int;
  v_dias_transcurridos int;
  v_dias_restantes     int;
  v_sum_7  numeric(14,2);
  v_sum_30 numeric(14,2);
  v_avg_7  numeric(14,2);
  v_avg_30 numeric(14,2);
  v_momentum numeric(10,4);
  v_monthly_income numeric(14,2);
  v_savings_goal   numeric(14,2);
  v_sum_fijos      numeric(14,2);
  v_libre          numeric(14,2);
  v_gastado_ciclo  numeric(14,2);
  v_forecast       numeric(14,2);
  v_stress text;
  v_anchor date;
  v_override numeric(14,2);
  v_eff_income numeric(14,2);
  v_income_mode text;
  v_cycle_extra numeric(14,2);
begin
  for v_rec in
    select distinct e.family_id
    from public.expenses e
    where e.created_at >= (v_today - interval '30 days')::timestamptz
  loop
    begin
      -- ── Resolve the user's pay cycle ──────────────────────────────
      select coalesce(ff.salary_payment_day, 1),
             coalesce(ff.monthly_income, 0),
             coalesce(ff.savings_goal, 0),
             ff.current_cycle_anchor,
             ff.current_cycle_starting_balance,
             coalesce(ff.income_mode, 'fixed')
        into v_payment_day, v_monthly_income, v_savings_goal, v_anchor, v_override, v_income_mode
        from public.family_finance ff
       where ff.family_id = v_rec.family_id;

      if v_payment_day is null then
        v_payment_day := 1;
      end if;

      if extract(day from v_today)::int >= v_payment_day then
        v_cycle_start := date_trunc('day', make_date(
          extract(year from v_today)::int,
          extract(month from v_today)::int,
          least(v_payment_day,
                extract(day from
                  (date_trunc('month', v_today) + interval '1 month' - interval '1 day')
                )::int)
        ))::timestamptz;
      else
        v_cycle_start := date_trunc('day',
          (date_trunc('month', v_today) - interval '1 month')
          + (least(v_payment_day,
                   extract(day from
                     (date_trunc('month', v_today) - interval '1 day')
                   )::int) - 1) * interval '1 day'
        )::timestamptz;
      end if;
      v_cycle_end := v_cycle_start + interval '1 month';
      v_cycle_days := greatest(
        1,
        round(extract(epoch from (v_cycle_end - v_cycle_start)) / 86400.0)::int
      );
      v_dias_transcurridos := greatest(
        0,
        round(extract(epoch from (v_today::timestamptz - v_cycle_start)) / 86400.0)::int
      );
      v_dias_transcurridos := least(v_dias_transcurridos, v_cycle_days);
      v_dias_restantes := greatest(0, v_cycle_days - v_dias_transcurridos);

      -- ── Override del ciclo (mismo criterio que cycle_disponible) ───
      -- Si el usuario confirmó un saldo para ESTE ciclo (anchor == inicio del
      -- ciclo actual), ese es el presupuesto BRUTO; sino, el sueldo recurrente.
      v_eff_income := case
        when v_anchor is not null
             and v_anchor = v_cycle_start::date
             and v_override is not null and v_override >= 0
          then v_override
        else v_monthly_income
      end;

      -- Modo DINÁMICO: el hogar se fondea con income_events, no con un
      -- sueldo. Sin esto, v_eff_income quedaba en 0 y el stress_level
      -- era 'critical' para siempre (y el asistente lo consumía crudo).
      if v_income_mode = 'dynamic' then
        select coalesce(sum(ie.amount), 0) into v_cycle_extra
          from public.income_events ie
         where ie.family_id = v_rec.family_id
           and ie.event_date >= v_cycle_start::date
           and ie.event_date <  v_cycle_end::date;
        v_eff_income := v_eff_income + coalesce(v_cycle_extra, 0);
      end if;

      -- ── Discretionary-only spend (last 7 / 30 days) ───────────────
      select coalesce(sum(e.price), 0) into v_sum_7
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.archived_at is null
         and e.commitment_id is null
         and e.created_at >= (v_today - interval '7 days')::timestamptz;

      select coalesce(sum(e.price), 0) into v_sum_30
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.commitment_id is null
         and e.created_at >= (v_today - interval '30 days')::timestamptz;

      v_avg_7  := round(v_sum_7  / 7.0,  2);
      v_avg_30 := round(v_sum_30 / 30.0, 2);

      if v_avg_30 > 0 then
        v_momentum := round(v_avg_7 / v_avg_30, 4);
      else
        v_momentum := 1;
      end if;

      -- ── What's already been spent IN THIS CYCLE (discretionary) ───
      select coalesce(sum(e.price), 0) into v_gastado_ciclo
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.archived_at is null
         and e.commitment_id is null
         and e.created_at >= v_cycle_start
         and e.created_at <  v_cycle_end;

      -- ── Monthly-equivalent fijos ──────────────────────────────────
      select coalesce(
        sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency)),
        0
      ) into v_sum_fijos
        from public.fixed_expenses fe
       where fe.family_id = v_rec.family_id
         and coalesce(fe.status, 'active') = 'active';

      -- ── Libre = ingreso EFECTIVO (override si aplica) − fijos − ahorro ──
      v_libre := greatest(
        0,
        v_eff_income - coalesce(v_sum_fijos, 0)
          -- Dinámico: el ahorro mensual por % no aplica (defensivo).
          - (case when v_income_mode = 'dynamic' then 0 else coalesce(v_savings_goal, 0) end)
      );

      -- ── Cycle-close forecast ──────────────────────────────────────
      v_forecast := round(v_gastado_ciclo + v_avg_7 * v_dias_restantes, 2);

      -- ── Stress level (apple-to-apple) ─────────────────────────────
      if v_libre <= 0 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.15 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.00 then
        v_stress := 'warn';
      elsif v_forecast > v_libre * 0.85 then
        v_stress := 'watch';
      else
        v_stress := 'calm';
      end if;

      insert into public.velocity_snapshots (
        family_id, snapshot_date,
        avg_daily_last_7, avg_daily_last_30,
        momentum, forecast_close_amount, stress_level
      ) values (
        v_rec.family_id, v_today,
        v_avg_7, v_avg_30,
        v_momentum, v_forecast, v_stress
      )
      on conflict (family_id, snapshot_date) do update set
        avg_daily_last_7 = excluded.avg_daily_last_7,
        avg_daily_last_30 = excluded.avg_daily_last_30,
        momentum = excluded.momentum,
        forecast_close_amount = excluded.forecast_close_amount,
        stress_level = excluded.stress_level;

    exception when others then
      raise notice 'velocity snapshot failed for family %: %',
        v_rec.family_id, sqlerrm;
    end;
  end loop;

  perform v_now;
exception when others then
  raise notice 'cron_compute_velocity_snapshots: %', sqlerrm;
end;
$function$;
