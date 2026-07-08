-- ════════════════════════════════════════════════════════════════════
-- Ingreso variable — defensivos del sueldo stale + cierre de ciclo.
--
--   1. close_monthly_cycle: en DINÁMICO el summary persiste
--      monthly_income/savings 0 (defensivo vs. sueldo stale post-switch),
--      savings_delta = ingresos del ciclo − gasto (antes 0 siempre → la
--      notificación de cierre nunca decía "Guardaste"), mood desde los
--      ingresos reales, y period_label de ciclos <21 días = rango
--      ("7–13 jul 2026") en vez del mes repetido.
--   2. cycle_disponible / velocity: base de ingreso 0 en dinámico sin
--      override (un monthly_income stale no infla el presupuesto).
--   3. list_pending_notifications: check-in matutino dice "del ciclo"
--      (era "del mes" — impreciso para ciclos semanales/quincenales).
-- Cada función parte VERBATIM de su última definición aplicada
-- (130000/140000/150000) — cero re-bases stale (lección 20260708160000).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.close_monthly_cycle(p_family_id uuid, p_period_start date, p_period_end date, p_force boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_existing_id uuid;
  v_finance record;
  v_variable_total numeric := 0;
  v_fixed_total numeric := 0;
  v_extra_income numeric := 0;
  v_expenses_count int := 0;
  v_fixed_paid_count int := 0;
  v_category_breakdown jsonb;
  v_daily_totals jsonb;
  v_by_member jsonb;
  v_top_expense jsonb;
  v_previous_total numeric;
  v_delta_pct numeric;
  v_mood text;
  v_period_label text;
  v_expected_monthly numeric;
  v_summary_id uuid;
  v_family_created timestamptz;
  v_is_dynamic boolean := false;
  v_days int;
  v_label_start_abbr text;
  v_label_end_abbr text;
begin
  -- Idempotency: already closed for this exact period?
  select id into v_existing_id
  from public.monthly_summaries
  where family_id = p_family_id and period_start = p_period_start;

  if v_existing_id is not null and not p_force then
    return jsonb_build_object(
      'status', 'already_closed',
      'id', v_existing_id,
      'period_start', p_period_start
    );
  end if;

  -- Load finance once (we use it for guard 2 and for context).
  select * into v_finance from public.family_finance where family_id = p_family_id;
  v_is_dynamic := coalesce(v_finance.income_mode, 'fixed') = 'dynamic';

  -- Guard 0 (ANTI-FANTASMA, de 20260625040000 — preservado en esta
  -- redefinición): no cerrar un ciclo que terminó ANTES de que la familia
  -- existiera. Una cuenta onboardeada mid-ciclo tiene un "ciclo anterior"
  -- que predata la familia; el cron nocturno lo cerraba con savings_delta
  -- = sueldo entero → modal de sobrante falso.
  if not p_force then
    select created_at into v_family_created from public.families where id = p_family_id;
    if v_family_created is not null and v_family_created::date >= p_period_end then
      return jsonb_build_object(
        'status', 'family_too_new',
        'family_created', v_family_created,
        'period_end', p_period_end
      );
    end if;
  end if;

  -- Guard 1: cycle must have ended.
  if not p_force and current_date < p_period_end then
    return jsonb_build_object('status', 'not_yet_ended', 'period_end', p_period_end);
  end if;

  -- Guard 2: user must have confirmed the next salary. Familias en modo
  -- 'dynamic' no tienen cobro fijo que confirmar -> el guard no aplica
  -- (sin esto, sus ciclos no cerrarian nunca).
  if not p_force and coalesce(v_finance.income_mode, 'fixed') <> 'dynamic' and (
    v_finance.last_salary_confirmed_at is null
    or v_finance.last_salary_confirmed_at < p_period_end::timestamptz
  ) then
    return jsonb_build_object(
      'status', 'salary_not_confirmed',
      'last_salary_confirmed_at', v_finance.last_salary_confirmed_at,
      'period_end', p_period_end
    );
  end if;

  -- Totals (variable = expenses without commitment_id; fixed = those with).
  select
    coalesce(sum(price) filter (where commitment_id is null), 0),
    coalesce(sum(price) filter (where commitment_id is not null), 0),
    coalesce(count(*) filter (where commitment_id is null), 0)::int
  into v_variable_total, v_fixed_total, v_expenses_count
  from public.expenses
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz;

  -- Income extra del ciclo (income_events: arrastres "acumular", bonos,
  -- transferencias). Es parte del income real del ciclo y por eso entra al
  -- sobrante decidible. Ventana por event_date, igual que el resto del app.
  select coalesce(sum(amount), 0) into v_extra_income
  from public.income_events
  where family_id = p_family_id
    and event_date >= p_period_start
    and event_date < p_period_end;

  -- Count of fixed expenses paid in the period.
  select count(*)::int into v_fixed_paid_count
  from public.fixed_expense_payments fep
  join public.fixed_expenses fe on fe.id = fep.fixed_expense_id
  where fe.family_id = p_family_id
    and fep.period_month >= p_period_start
    and fep.period_month < p_period_end;

  -- Category breakdown (variable only).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cat_id,
      'name', cat_name,
      'color', cat_color,
      'total', cat_total,
      'count', cat_count,
      'pct', case when v_variable_total > 0
        then round((cat_total / v_variable_total) * 100, 1)
        else 0::numeric end
    ) order by cat_total desc
  ), '[]'::jsonb) into v_category_breakdown
  from (
    select
      c.id as cat_id,
      c.name as cat_name,
      c.color as cat_color,
      sum(e.price)::numeric as cat_total,
      count(*)::int as cat_count
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by c.id, c.name, c.color
  ) x;

  -- Daily totals (for sparkline).
  select coalesce(jsonb_agg(
    jsonb_build_object('day', d::text, 'total', daily_total)
    order by d asc
  ), '[]'::jsonb) into v_daily_totals
  from (
    select date(e.created_at) as d, sum(e.price)::numeric as daily_total
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by date(e.created_at)
  ) x;

  -- Per-member contribution.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', member_id,
      'display_name', coalesce(member_name, 'Usuario'),
      'total', member_total,
      'count', member_count
    ) order by member_total desc
  ), '[]'::jsonb) into v_by_member
  from (
    select
      e.created_by as member_id,
      p.display_name as member_name,
      sum(e.price)::numeric as member_total,
      count(*)::int as member_count
    from public.expenses e
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by e.created_by, p.display_name
  ) x;

  -- Top expense (variable, highest price).
  select jsonb_build_object(
    'id', e.id,
    'description', e.description,
    'price', e.price,
    'category_id', e.category_id,
    'created_at', e.created_at
  ) into v_top_expense
  from public.expenses e
  where e.family_id = p_family_id
    and e.commitment_id is null
    and e.created_at >= p_period_start::timestamptz
    and e.created_at < p_period_end::timestamptz
  order by e.price desc, e.created_at desc
  limit 1;

  -- Delta vs previous rollup (whose period_end == this period_start).
  select total_variable_spent into v_previous_total
  from public.monthly_summaries
  where family_id = p_family_id and period_end = p_period_start
  limit 1;

  if v_previous_total is not null and v_previous_total > 0 then
    v_delta_pct := round(
      ((v_variable_total - v_previous_total) / v_previous_total) * 100,
      1
    );
  end if;

  -- Mood = how the cycle went vs expected variable budget.
  -- DINÁMICO: el presupuesto esperado no sale del sueldo (=0) sino de
  -- los ingresos reales del ciclo — sin esto mood quedaba null y la
  -- notificación de cierre nunca decía "Guardaste $X".
  v_expected_monthly := case
    when v_is_dynamic then greatest(0, v_extra_income - v_fixed_total)
    else greatest(
      0,
      coalesce(v_finance.monthly_income, 0)
        - coalesce(v_finance.savings_goal, 0)
        - v_fixed_total
    )
  end;
  v_mood := case
    when v_expected_monthly = 0 then null
    when v_variable_total <= v_expected_monthly * 0.85 then 'green'
    when v_variable_total <= v_expected_monthly then 'yellow'
    else 'red'
  end;

  -- Ciclos CORTOS (semana/quincena, <21 días): rango "7–13 jul 2026" en
  -- vez del nombre de mes que se repetiría 2-4 veces por mes (dinámico Y
  -- sueldos rolling — mismo criterio que el wrapped en cliente).
  -- period_end es exclusivo → el último día mostrado es period_end - 1.
  v_days := (p_period_end - p_period_start);
  if v_days > 0 and v_days < 21 then
    v_label_start_abbr := case extract(month from p_period_start)::int
      when 1 then 'ene' when 2 then 'feb' when 3 then 'mar' when 4 then 'abr'
      when 5 then 'may' when 6 then 'jun' when 7 then 'jul' when 8 then 'ago'
      when 9 then 'sep' when 10 then 'oct' when 11 then 'nov' when 12 then 'dic' end;
    v_label_end_abbr := case extract(month from (p_period_end - 1))::int
      when 1 then 'ene' when 2 then 'feb' when 3 then 'mar' when 4 then 'abr'
      when 5 then 'may' when 6 then 'jun' when 7 then 'jul' when 8 then 'ago'
      when 9 then 'sep' when 10 then 'oct' when 11 then 'nov' when 12 then 'dic' end;
    if date_trunc('month', p_period_start::timestamp) = date_trunc('month', (p_period_end - 1)::timestamp) then
      v_period_label := extract(day from p_period_start)::int::text
        || '–' || extract(day from (p_period_end - 1))::int::text
        || ' ' || v_label_end_abbr
        || ' ' || extract(year from (p_period_end - 1))::text;
    else
      v_period_label := extract(day from p_period_start)::int::text || ' ' || v_label_start_abbr
        || ' – ' || extract(day from (p_period_end - 1))::int::text || ' ' || v_label_end_abbr
        || ' ' || extract(year from (p_period_end - 1))::text;
    end if;
  else
    v_period_label := (case extract(month from p_period_start)::int
      when 1 then 'Enero'
      when 2 then 'Febrero'
      when 3 then 'Marzo'
      when 4 then 'Abril'
      when 5 then 'Mayo'
      when 6 then 'Junio'
      when 7 then 'Julio'
      when 8 then 'Agosto'
      when 9 then 'Septiembre'
      when 10 then 'Octubre'
      when 11 then 'Noviembre'
      when 12 then 'Diciembre'
    end) || ' ' || extract(year from p_period_start)::text;
  end if;

  -- Upsert the summary.
  insert into public.monthly_summaries (
    family_id, period_start, period_end, period_label,
    total_variable_spent, total_fixed_spent, total_spent,
    expenses_count, fixed_paid_count,
    monthly_income, savings_goal_amount, savings_delta, extra_income,
    category_breakdown, daily_totals, by_member, top_expense,
    delta_vs_previous_percent, mood
  )
  values (
    p_family_id, p_period_start, p_period_end, v_period_label,
    v_variable_total, v_fixed_total, v_variable_total + v_fixed_total,
    v_expenses_count, v_fixed_paid_count,
    -- DINÁMICO: sueldo/ahorro 0 (defensivo vs. monthly_income stale de
    -- un hogar que cambió de modo — sin esto el sobrante decidible y el
    -- wrapped inflaban con un sueldo fantasma) y savings_delta desde los
    -- ingresos REALES del ciclo (antes quedaba 0 siempre y la notificación
    -- de cierre nunca decía "Guardaste $X").
    case when v_is_dynamic then 0 else coalesce(v_finance.monthly_income, 0) end,
    case when v_is_dynamic then 0 else coalesce(v_finance.savings_goal, 0) end,
    case when v_is_dynamic
         then greatest(0, v_extra_income - (v_variable_total + v_fixed_total))
         else greatest(0, coalesce(v_finance.monthly_income, 0) - (v_variable_total + v_fixed_total)) end,
    v_extra_income,
    v_category_breakdown, v_daily_totals, v_by_member, v_top_expense,
    v_delta_pct, v_mood
  )
  on conflict (family_id, period_start) do update set
    period_end = excluded.period_end,
    period_label = excluded.period_label,
    total_variable_spent = excluded.total_variable_spent,
    total_fixed_spent = excluded.total_fixed_spent,
    total_spent = excluded.total_spent,
    expenses_count = excluded.expenses_count,
    fixed_paid_count = excluded.fixed_paid_count,
    monthly_income = excluded.monthly_income,
    savings_goal_amount = excluded.savings_goal_amount,
    savings_delta = excluded.savings_delta,
    extra_income = excluded.extra_income,
    category_breakdown = excluded.category_breakdown,
    daily_totals = excluded.daily_totals,
    by_member = excluded.by_member,
    top_expense = excluded.top_expense,
    delta_vs_previous_percent = excluded.delta_vs_previous_percent,
    mood = excluded.mood
  returning id into v_summary_id;

  -- Archive the underlying expenses (soft delete via archived_at).
  update public.expenses
  set archived_at = now()
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz
    and archived_at is null;

  return jsonb_build_object(
    'status', 'closed',
    'id', v_summary_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'period_label', v_period_label,
    'variable_total', v_variable_total,
    'fixed_total', v_fixed_total,
    'extra_income', v_extra_income,
    'expenses_count', v_expenses_count
  );
end;
$function$;

create or replace function public.cycle_disponible(p_family_id uuid, p_as_of date)
 returns table(daily_budget numeric, available_today numeric, raw_cycle_balance numeric, has_override boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with f as (
    select ff.monthly_income::numeric as monthly_income,
           coalesce(ff.income_mode, 'fixed') as income_mode,
           coalesce(ff.salary_payment_day, 1) as salary_day,
           coalesce(ff.cycle_type, 'monthly') as cycle_type,
           ff.cycle_anchor_date,
           ff.cycle_length_days,
           coalesce(ff.savings_goal, 0)::numeric as savings_goal,
           coalesce(ff.savings_goal_percent, 0)::numeric as savings_goal_percent,
           ff.current_cycle_anchor,
           ff.current_cycle_starting_balance::numeric as starting_balance
    from public.family_finance ff
    where ff.family_id = p_family_id
  ),
  win as (
    -- Ventana vía compute_pay_cycle (helper central). DINÁMICO sigue el
    -- ciclo elegido (semana/quincena/mes); FIXED conserva la ventana
    -- mensual anclada al salary_day (la rama 'monthly' del helper es
    -- exactamente la lógica inline que había acá — cero cambio).
    select f.*,
      cp.cycle_start,
      cp.cycle_end_exclusive as cycle_end,
      greatest(1, cp.cycle_days)::int as days,
      greatest(1, (cp.cycle_end_exclusive - p_as_of))::int as days_remaining
    from f
    cross join lateral public.compute_pay_cycle(
      p_as_of,
      case when f.income_mode = 'dynamic' then f.cycle_type else 'monthly' end,
      f.salary_day::smallint,
      f.cycle_anchor_date,
      f.cycle_length_days
    ) cp
  ),
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
      coalesce((select sum(ie.amount) from public.income_events ie
        where ie.family_id = p_family_id and ie.event_date >= w.cycle_start and ie.event_date < w.cycle_end), 0) as extra_income
    from win w
  ),
  calc as (
    select w.monthly_income, w.days, w.days_remaining, w.savings_goal, w.savings_goal_percent,
      (w.current_cycle_anchor = w.cycle_start and w.starting_balance is not null and w.starting_balance >= 0) as ov,
      (w.income_mode = 'dynamic') as dyn,
      w.starting_balance,
      p.paid_total,
      (p.paid_total + p.reserved_total) as pressure,
      s.var_cycle, s.extra_income
    from win w, press p, spend s
  ),
  res as (
    select c.*,
      -- DINÁMICO sin override: base 0 — un monthly_income stale (hogar
      -- que cambió de modo con contribuciones cargadas) no debe inflar
      -- el presupuesto; los ingresos del ciclo entran por extra_income.
      case when c.ov then c.starting_balance when c.dyn then 0 else c.monthly_income end as eff_income,
      -- Modo dinamico: el cupo reparte lo disponible sobre los dias RESTANTES
      -- (mismo tratamiento que el override), aunque no haya override real.
      case when (c.ov or c.dyn) then greatest(1, c.days_remaining) else greatest(1, c.days) end as eff_days,
      (c.ov and c.starting_balance < c.monthly_income) as ov_down
    from calc c
  ),
  res2 as (
    select r.*,
      case when r.ov_down then greatest(1, r.days_remaining)::numeric / greatest(1, r.days) else 1 end as proration,
      -- Dinámico: la config de ahorro mensual NO aplica (defensivo: aunque
      -- un fixed→dynamic haya dejado savings_goal seteado, no se resta).
      case when r.dyn then 0
           when r.ov_down then greatest(0, round(r.eff_income * (r.savings_goal_percent / 100)))
           else r.savings_goal end as eff_savings,
      r.var_cycle as var_metrics
    from res r
  )
  select
    -- CUPO: base DISCRECIONAL (reserva TODOS los fijos = pressure) / días.
    case when (r.ov or r.dyn)
      then greatest(0, round(greatest(0, round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income)) / greatest(1, r.eff_days)))
      else greatest(0, round(greatest(0, round(r.eff_income - r.pressure - r.eff_savings)) / greatest(1, r.eff_days)))
    end::numeric as daily_budget,
    -- SALDO REAL: resta solo los fijos PAGADOS (paid_total), no los pendientes.
    greatest(0, round((r.eff_income - r.eff_savings - (r.paid_total * r.proration) - r.var_metrics) + r.extra_income))::numeric as available_today,
    round((r.eff_income - r.eff_savings - (r.paid_total * r.proration) - r.var_metrics) + r.extra_income)::numeric as raw_cycle_balance,
    r.ov as has_override
  from res2 r;
$function$;

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
  v_cycle_type text;
  v_cycle_anchor date;
  v_cycle_len smallint;
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
             coalesce(ff.income_mode, 'fixed'),
             coalesce(ff.cycle_type, 'monthly'),
             ff.cycle_anchor_date,
             ff.cycle_length_days
        into v_payment_day, v_monthly_income, v_savings_goal, v_anchor, v_override, v_income_mode,
             v_cycle_type, v_cycle_anchor, v_cycle_len
        from public.family_finance ff
       where ff.family_id = v_rec.family_id;

      if v_payment_day is null then
        v_payment_day := 1;
      end if;

      -- Ventana vía compute_pay_cycle: DINÁMICO sigue el ciclo elegido
      -- (semana/quincena/mes); FIXED conserva la mensual del salary_day.
      select cp.cycle_start::timestamptz, cp.cycle_end_exclusive::timestamptz
        into v_cycle_start, v_cycle_end
        from public.compute_pay_cycle(
          v_today,
          case when v_income_mode = 'dynamic' then v_cycle_type else 'monthly' end,
          v_payment_day::smallint,
          v_cycle_anchor,
          v_cycle_len
        ) cp;
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
        -- DINÁMICO sin override: base 0 (defensivo vs. sueldo stale de un
        -- hogar que cambió de modo); los income_events se suman abajo.
        when v_income_mode = 'dynamic' then 0
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
          case when f.lang = 'en' then 'Today you have ~$' || to_char(round(f.daily_budget), 'FM999,999,999') || ' to spend. $' || to_char(round(f.available_today), 'FM999,999,999') || ' left this cycle.'
               else 'Hoy tenés ~$' || to_char(round(f.daily_budget), 'FM999,999,999') || ' para gustos. Quedan $' || to_char(round(f.available_today), 'FM999,999,999') || ' del ciclo.' end
        else
          case when f.lang = 'en' then 'This cycle you''re already $' || to_char(round(abs(f.raw_cycle_balance)), 'FM999,999,999') || ' over plan. Best today: $0 on extras.'
               else 'Este ciclo ya vas $' || to_char(round(abs(f.raw_cycle_balance)), 'FM999,999,999') || ' arriba del plan. Hoy ideal: $0 en gustos.' end
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
