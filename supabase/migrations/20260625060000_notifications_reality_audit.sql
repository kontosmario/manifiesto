-- WHAT: Auditoría de notificaciones push de cron — que reflejen la realidad.
--   (1) goal_behind (cron_emit_weekly_insights): usaba el MES CALENDARIO
--       (date_trunc('month')) para la ventana del aporte del ciclo, en vez del
--       ciclo de COBRO real → contradecía el app. Además disparaba "vas atrasado"
--       para metas recién creadas (sin tiempo de aportar). Fix: ventana = ciclo
--       de cobro (user_current_cycle_start) + guard de meta fresca (creada antes
--       del ciclo actual).
--   (2) morning_checkin (list_pending_notifications): cuando el sueldo NO está
--       confirmado para el ciclo (cobro pendiente), el cupo se computaba sobre el
--       ciclo nuevo (stale/engañoso, el app está congelado en el ciclo anterior).
--       Fix + valor: en ese caso, en vez de un número stale → "Llegó tu cobro,
--       confirmá tu sueldo" (route a Home, donde abre la sheet de confirmación).
-- WHY:  Las cron/notis no deben reinventar (mal) la lógica financiera del cliente.
--       Ver feedback_daily_budget_canonical_source.

-- ── (1) goal_behind sobre el ciclo de cobro real ────────────────────────────
create or replace function public.cron_emit_weekly_insights()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_fam record;
  v_goal record;
  v_cycle_start date;
  v_contrib_this_cycle numeric(12,2);
  v_target_pace numeric(12,2);
  v_months_remaining integer;
begin
  for v_fam in select f.id as family_id from public.families f loop
    begin
      -- Ciclo de COBRO real (espejo del app), no el mes calendario.
      v_cycle_start := public.user_current_cycle_start(v_fam.family_id);

      for v_goal in
        select sg.id, sg.title, sg.goal_amount, sg.current_amount, sg.target_months
        from public.savings_goals sg
        where sg.family_id = v_fam.family_id
          and sg.is_active
          -- Guard meta fresca: solo evaluamos metas que existían ANTES del ciclo
          -- actual (tuvieron al menos un ciclo completo para aportar). Una meta
          -- recién creada no puede estar "atrasada".
          and sg.created_at::date < v_cycle_start
      loop
        begin
          if coalesce(v_goal.target_months, 0) <= 0 or coalesce(v_goal.goal_amount, 0) <= 0 then
            continue;
          end if;

          v_months_remaining := greatest(1, coalesce(v_goal.target_months, 1));
          v_target_pace := (coalesce(v_goal.goal_amount, 0) - coalesce(v_goal.current_amount, 0))
                           / v_months_remaining;

          -- Aporte de ESTE ciclo (proxy: deltas de las notis goal_contribution,
          -- emitidas por notify_savings_goal_change en cada aporte real). Ventana
          -- = ciclo de cobro.
          select coalesce(sum(((n.metadata ->> 'delta')::numeric)), 0)
          into v_contrib_this_cycle
          from public.notifications n
          where n.family_id = v_fam.family_id
            and n.kind = 'goal_contribution'
            and (n.metadata ->> 'goal_id') = v_goal.id::text
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_cycle_start;

          if v_target_pace > 0 and v_contrib_this_cycle < 0.3 * v_target_pace then
            if not exists (
              select 1 from public.notifications n
              where n.family_id = v_fam.family_id
                and n.kind = 'goal_behind'
                and (n.metadata ->> 'goal_id') = v_goal.id::text
                and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
            ) then
              perform public.emit_notification(
                v_fam.family_id, null,
                'Vas atrasado con ' || v_goal.title,
                'Este ciclo aportaste $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
                  || ' · ritmo sugerido $' || to_char(round(v_target_pace), 'FM999,999,999') || '/mes.',
                'goal_behind', 'warning', null,
                jsonb_build_object('route', '/savings-goal', 'goal_id', v_goal.id,
                  'contribution', v_contrib_this_cycle, 'target_pace', v_target_pace)
              );
            end if;
          end if;
        exception when others then null;
        end;
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$function$;

-- ── (2) morning_checkin: branch de cobro pendiente ──────────────────────────
create or replace function public.list_pending_notifications(p_kind text)
 returns table(family_id uuid, user_id uuid, title text, body text, kind text, severity text, metadata jsonb, dedup_key text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    with member as (
      select fm.family_id, fm.user_id, coalesce(p.display_name, 'vos') as display_name,
        ff.monthly_income, coalesce(ff.salary_payment_day, 1) as salary_day,
        coalesce(ff.savings_goal, 0) as savings_goal,
        ff.last_salary_confirmed_at,
        coalesce(ff.daily_budget_buffer_mode, 'none') as buffer_mode,
        coalesce(ff.daily_budget_buffer_value, 0) as buffer_value
      from public.family_members fm
      join public.family_finance ff on ff.family_id = fm.family_id
      left join public.profiles p on p.id = fm.user_id
      left join public.notification_preferences np on np.user_id = fm.user_id
      where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked'
        and coalesce(np.channel_inapp, true)
        and not ('checkin_morning' = any (coalesce(np.kinds_muted, array[]::text[])))
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
        -- confirmado = el sueldo de ESTE ciclo ya fue confirmado. Si no, el
        -- cupo se computaría sobre un ciclo que el app tiene congelado → stale.
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
      'Buen día, ' || split_part(btrim(f.display_name), ' ', 1) as title,
      case
        when not f.confirmado then
          'Llegó tu cobro 💸 Confirmá tu sueldo para ver tu cupo del nuevo ciclo.'
        when f.restante > 0 then
          'Hoy tenés ~$' || to_char(round(f.cupo_hoy), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.restante), 'FM999,999,999') || ' del mes.'
        else 'Este mes ya vas $' || to_char(round(abs(f.restante)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.'
      end as body,
      'checkin_morning' as kind,
      case when not f.confirmado then 'warning' when f.restante > 0 then 'info' else 'warning' end as severity,
      jsonb_build_object('route', '/', 'cupo_hoy', round(f.cupo_hoy), 'restante', round(f.restante),
        'salary_pending', (not f.confirmado)) as metadata,
      'checkin_morning:' || f.family_id::text || ':' || f.user_id::text || ':' || v_today_ar::text as dedup_key
    from final f;
  elsif p_kind = 'midday_checkins' then
    return query
    select fm.family_id, fm.user_id, 'Medio día' as title, 'Pasá por la app y revisá cómo vas hoy.' as body,
      'checkin_midday' as kind, 'info' as severity, jsonb_build_object('route', '/') as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text || ':' || v_today_ar::text as dedup_key
    from public.family_members fm join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
      and not ('checkin_midday' = any (coalesce(np.kinds_muted, array[]::text[])));
  elsif p_kind = 'evening_checkins' then
    return query
    select fm.family_id, fm.user_id, 'Cierre del día' as title, 'Anotá lo último de hoy y mantené la racha.' as body,
      'checkin_evening' as kind, 'info' as severity, jsonb_build_object('route', '/expenses') as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text || ':' || v_today_ar::text as dedup_key
    from public.family_members fm join public.family_finance ff on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0 and fm.role <> 'blocked' and coalesce(np.channel_inapp, true)
      and not ('checkin_evening' = any (coalesce(np.kinds_muted, array[]::text[])));
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
end;
$function$;
