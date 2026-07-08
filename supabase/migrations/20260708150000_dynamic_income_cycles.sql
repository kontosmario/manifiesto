-- ════════════════════════════════════════════════════════════════════
-- Ingreso variable por CICLOS (semana / quincena / mes) — server.
--
-- El usuario dinámico ahora elige su ciclo; el cliente mide saldo/cupo
-- sobre esa ventana. Este archivo alinea el server:
--   1. `home_snapshot`: FIX del freeze — un dinámico mensual quedaba
--      CONGELADO en el ciclo anterior al rolar el mes (nunca confirma
--      sueldo). + `extra_income`/`savings_goal_amount` en el history
--      (el tipo cliente ya los declaraba; los usan el wrapped y la
--      señal income-volatility dinámica).
--   2. `cycle_disponible`: ventana vía compute_pay_cycle — dinámico
--      sigue su ciclo elegido; fixed conserva la mensual (la rama
--      'monthly' del helper ES la lógica inline previa).
--   3. `cron_compute_velocity_snapshots`: misma sustitución de ventana.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.home_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_period_month date := date_trunc('month', current_date)::date;
  v_payment_day int;
  v_today date := current_date;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return jsonb_build_object(
      'profile', (
        select to_jsonb(p) from (
          select id, display_name, created_at, avatar_animal, onboarding_completed_at
          from public.profiles
          where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'family_members', '[]'::jsonb,
      'notifications', '[]'::jsonb,
      'has_push_subscription', false,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'period_month', v_period_month,
      'payments_cycle_start', null,
      'payments_cycle_end', null,
      'monthly_summaries_history', '[]'::jsonb,
      'category_limits', '[]'::jsonb,
      'velocity_today', null,
      'advisor_signal_dismissals', '[]'::jsonb
      ,
      'no_spend_days_count_cycle', 0,
      'no_spend_days_this_cycle', '[]'::jsonb
    );
  end if;

  -- Cycle window via centralized helper. Soporta monthly + rolling-N regimes.
  declare
    v_cycle_type text;
    v_cycle_anchor_date date;
    v_cycle_length_days smallint;
    v_last_confirmed timestamptz;
    v_income_mode text;
    v_helper_result record;
  begin
    select
      coalesce(ff.salary_payment_day, 1)::smallint,
      coalesce(ff.cycle_type, 'monthly'),
      ff.cycle_anchor_date,
      ff.cycle_length_days,
      ff.last_salary_confirmed_at,
      coalesce(ff.income_mode, 'fixed')
    into v_payment_day, v_cycle_type, v_cycle_anchor_date, v_cycle_length_days, v_last_confirmed, v_income_mode
    from public.family_finance ff
    where ff.family_id = v_family_id;

    if v_payment_day is null then v_payment_day := 1; end if;
    if v_cycle_type is null then v_cycle_type := 'monthly'; end if;

    select cycle_start, cycle_end_exclusive
    into v_helper_result
    from public.compute_pay_cycle(
      v_today::date,
      v_cycle_type,
      v_payment_day::smallint,
      v_cycle_anchor_date,
      v_cycle_length_days
    );

    -- Freeze hasta confirmar el cobro (monthly): si el cobro de este ciclo no
    -- fue confirmado (last_salary_confirmed_at < cycle_start), el ciclo activo
    -- del snapshot es el ANTERIOR → el saldo + los fijos NO saltan al ingreso
    -- nuevo hasta que el user confirme. Espeja el freeze del cliente
    -- (computeIsSalaryPendingConfirmation / getCurrentPayCycle).
    -- DINÁMICO: no hay cobro que confirmar — sin esta exención, al
    -- rolar el mes el snapshot quedaba CONGELADO en el ciclo anterior
    -- para siempre (last_salary_confirmed_at nunca se re-stampa).
    if v_cycle_type = 'monthly'
       and v_income_mode <> 'dynamic'
       and (
         v_last_confirmed is null
         or v_last_confirmed::date < v_helper_result.cycle_start
       )
    then
      select cycle_start, cycle_end_exclusive
      into v_helper_result
      from public.compute_pay_cycle(
        (v_helper_result.cycle_start - interval '1 day')::date,
        v_cycle_type,
        v_payment_day::smallint,
        v_cycle_anchor_date,
        v_cycle_length_days
      );
    end if;

    v_cycle_start := v_helper_result.cycle_start::timestamptz;
    v_cycle_end := v_helper_result.cycle_end_exclusive::timestamptz;
  end;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object('familyId', v_family_id, 'kind', (select kind from public.families where id = v_family_id), 'created_at', (select created_at from public.families where id = v_family_id)),
    'family_finance', (
      select jsonb_build_object(
        'family_id', ff.family_id,
        'monthly_income', ff.monthly_income::float8,
        'income_mode', coalesce(ff.income_mode, 'fixed'),
        'savings_goal', ff.savings_goal::float8,
        'savings_goal_percent', ff.savings_goal_percent,
        'usd_exchange_rate', ff.usd_exchange_rate::float8,
        'local_currency', ff.local_currency,
        'usd_rate_enabled', ff.usd_rate_enabled,
        'salary_payment_day', ff.salary_payment_day,
        'last_salary_confirmed_at', ff.last_salary_confirmed_at,
        'daily_budget_buffer_mode', ff.daily_budget_buffer_mode,
        'daily_budget_buffer_value', ff.daily_budget_buffer_value::float8,
        'daily_budget_nudges_enabled', ff.daily_budget_nudges_enabled,
        'daily_budget_checkin_hour', ff.daily_budget_checkin_hour,
        'current_cycle_starting_balance', ff.current_cycle_starting_balance::float8,
        'current_cycle_anchor', ff.current_cycle_anchor,
        'cycle_type', ff.cycle_type,
        'cycle_anchor_date', ff.cycle_anchor_date,
        'cycle_length_days', ff.cycle_length_days,
        'monthly_reserve_amount', ff.monthly_reserve_amount::float8
      )
      from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fe.id,
          'family_id', fe.family_id,
          'name', fe.name,
          'amount', fe.amount::float8,
          'created_at', fe.created_at,
          'updated_at', fe.updated_at,
          'kind', fe.kind,
          'status', fe.status,
          'frequency', fe.frequency,
          'category_id', fe.category_id,
          'next_due_on', fe.next_due_on,
          'ends_on', fe.ends_on,
          'installments_total', fe.installments_total,
          'installments_paid', fe.installments_paid,
          'remaining_balance', fe.remaining_balance::float8,
          'lender_name', fe.lender_name,
          'notes', fe.notes,
          'last_paid_at', fe.last_paid_at,
          'day_of_month', fe.day_of_month,
          'notify_days_before', fe.notify_days_before,
          'last_used_at', fe.last_used_at
        )
        order by fe.status asc, fe.next_due_on asc nulls last, fe.created_at asc
      )
      from (
        select * from public.fixed_expenses
        where family_id = v_family_id
        order by status asc, next_due_on asc nulls last, created_at asc
        limit 100
      ) fe
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'family_id', e.family_id,
          'category_id', e.category_id,
          'description', e.description,
          'notes', e.notes,
          'price', e.price::float8,
          'created_by', e.created_by,
          'created_at', e.created_at,
          'commitment_id', e.commitment_id,
          'archived_at', e.archived_at
        )
        order by e.created_at desc
      )
      from (
        select * from public.expenses
        where family_id = v_family_id
          and archived_at is null
        order by created_at desc
        limit 120
      ) e
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', (
      select count(*) from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ),
    'family_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', fm.user_id,
          'role', fm.role,
          'blocked_at', fm.blocked_at,
          'display_name', p.display_name,
          'avatar_animal', p.avatar_animal,
          'created_at', fm.created_at,
          -- 2026-05-09: nuevo campo. Usado por useFamilyMembersDetail
          -- (advisor host, settings, family-admin) para evitar 2
          -- round-trips extras (family_members + profiles).
          'monthly_income_contribution', fm.monthly_income_contribution::float8
        )
        order by
          case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
          fm.created_at asc
      )
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n.*) order by n.created_at desc)
      from (
        select * from public.notifications
        where family_id = v_family_id
          and (user_id is null or user_id = v_user_id)
        order by created_at desc
        limit 80
      ) n
    ), '[]'::jsonb),
    'has_push_subscription', exists (
      select 1 from public.push_subscriptions ps
      where ps.user_id = v_user_id and ps.family_id = v_family_id
    ),
    'savings_goal', (
      select to_jsonb(sg.*)
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.paid_at >= v_cycle_start
        and fep.paid_at < v_cycle_end
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'period_month', date_trunc('month', v_cycle_start)::date,
    'payments_cycle_start', v_cycle_start,
    'payments_cycle_end', v_cycle_end,
    'monthly_summaries_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'period_start', ms.period_start,
          'period_end', ms.period_end,
          'period_label', ms.period_label,
          'total_variable_spent', ms.total_variable_spent::float8,
          'total_fixed_spent', ms.total_fixed_spent::float8,
          'total_spent', ms.total_spent::float8,
          'expenses_count', ms.expenses_count,
          'fixed_paid_count', ms.fixed_paid_count,
          'monthly_income', ms.monthly_income::float8,
          'savings_delta', ms.savings_delta::float8,
          'extra_income', ms.extra_income::float8,
          'savings_goal_amount', ms.savings_goal_amount::float8,
          'category_breakdown', ms.category_breakdown,
          'daily_totals', ms.daily_totals,
          'delta_vs_previous_percent', ms.delta_vs_previous_percent,
          'mood', ms.mood,
          'top_expense', ms.top_expense,
          'wrapped_seen_at', ms.wrapped_seen_at
        )
        order by ms.period_start desc
      )
      from (
        select *
        from public.monthly_summaries
        where family_id = v_family_id
        order by period_start desc
        limit 6
      ) ms
    ), '[]'::jsonb),
    'category_limits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cl.id,
          'category_id', cl.category_id,
          'monthly_cap', cl.monthly_cap::float8,
          'warning_threshold_pct', cl.warning_threshold_pct
        )
        order by cl.created_at asc
      )
      from public.category_limits cl
      where cl.family_id = v_family_id
    ), '[]'::jsonb),
    'velocity_today', (
      select jsonb_build_object(
        'id', vs.id,
        'family_id', vs.family_id,
        'snapshot_date', vs.snapshot_date,
        'avg_daily_last_7', vs.avg_daily_last_7::float8,
        'avg_daily_last_30', vs.avg_daily_last_30::float8,
        'momentum', vs.momentum::float8,
        'forecast_close_amount', vs.forecast_close_amount::float8,
        'stress_level', vs.stress_level,
        'created_at', vs.created_at
      )
      from public.velocity_snapshots vs
      where vs.family_id = v_family_id
      order by vs.snapshot_date desc
      limit 1
    ),
    'advisor_signal_dismissals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signal_id', asd.signal_id,
          'dismissed_at', asd.dismissed_at,
          'ignore_count', asd.ignore_count
        )
        order by asd.dismissed_at desc
      )
      from public.advisor_signal_dismissals asd
      where asd.user_id = v_user_id
    ), '[]'::jsonb)
    ,
    -- DISTINCT obligatorio con visibilidad familiar: dos miembros pueden
    -- marcar el MISMO día (PK family+user+date) y el día del hogar es uno.
    'no_spend_days_count_cycle', (
      select count(distinct md.marked_date)::int
      from public.streak_marked_days md
      where md.family_id = v_family_id
        and md.marked_date >= v_cycle_start::date
        and md.marked_date <= current_date
    ),
    'no_spend_days_this_cycle', coalesce((
      select jsonb_agg(day_text order by day_text desc)
      from (
        select distinct md.marked_date::text as day_text
        from public.streak_marked_days md
        where md.family_id = v_family_id
          and md.marked_date >= v_cycle_start::date
          and md.marked_date <= current_date
      ) days
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

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
      case when c.ov then c.starting_balance else c.monthly_income end as eff_income,
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
