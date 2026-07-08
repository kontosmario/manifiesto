-- ════════════════════════════════════════════════════════════════════
-- Modo de ingreso DINÁMICO (`family_finance.income_mode`).
--
-- WHAT: soporte para hogares SIN sueldo fijo — su presupuesto se
-- construye agregando ingresos manuales (`income_events`). El
-- onboarding deja de exigir sueldo > 0 cuando el usuario declara
-- ingreso variable, y el modelo del ciclo pasa a repartir lo
-- disponible (ingresos del ciclo − gasto − fijos − ahorro) sobre los
-- días RESTANTES — el mismo tratamiento del override, que ya está
-- probado por el parity test.
--
-- Piezas:
--   1. Columna `income_mode` ('fixed'|'dynamic', default 'fixed').
--   2. `home_snapshot()`: expone `income_mode` (gotcha conocido:
--      columna nueva de family_finance → snapshot) y `families.created_at`
--      (ancla del jardín familiar, ver 20260708120000). Aprovecha y
--      corrige los `no_spend_days_*` a visibilidad FAMILIAR (el jardín
--      es del hogar).
--   3. `cycle_disponible()`: paridad con el cliente para el push
--      "Buen día" — en modo dinámico el cupo reparte sobre días
--      restantes (flag `dyn` espeja `hasCycleOverride` del cliente).
--   4. `close_monthly_cycle()`: el Guard 2 (sueldo confirmado) no
--      aplica a familias dinámicas — sin esto sus ciclos no cerrarían.
-- ════════════════════════════════════════════════════════════════════

alter table public.family_finance
  add column if not exists income_mode text not null default 'fixed';

do $$
begin
  alter table public.family_finance
    add constraint family_finance_income_mode_check
    check (income_mode in ('fixed', 'dynamic'));
exception when duplicate_object then null;
end $$;

-- ─── home_snapshot: income_mode + families.created_at + no_spend familiar ───

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
    v_helper_result record;
  begin
    select
      coalesce(ff.salary_payment_day, 1)::smallint,
      coalesce(ff.cycle_type, 'monthly'),
      ff.cycle_anchor_date,
      ff.cycle_length_days,
      ff.last_salary_confirmed_at
    into v_payment_day, v_cycle_type, v_cycle_anchor_date, v_cycle_length_days, v_last_confirmed
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
    if v_cycle_type = 'monthly'
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


-- ─── cycle_disponible: modo dinámico reparte sobre días restantes ───

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
           coalesce(ff.savings_goal, 0)::numeric as savings_goal,
           coalesce(ff.savings_goal_percent, 0)::numeric as savings_goal_percent,
           ff.current_cycle_anchor,
           ff.current_cycle_starting_balance::numeric as starting_balance
    from public.family_finance ff
    where ff.family_id = p_family_id
  ),
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

-- ─── close_monthly_cycle: Guard 2 no aplica en modo dinámico ───

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
  v_expected_monthly := greatest(
    0,
    coalesce(v_finance.monthly_income, 0)
      - coalesce(v_finance.savings_goal, 0)
      - v_fixed_total
  );
  v_mood := case
    when v_expected_monthly = 0 then null
    when v_variable_total <= v_expected_monthly * 0.85 then 'green'
    when v_variable_total <= v_expected_monthly then 'yellow'
    else 'red'
  end;

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
    coalesce(v_finance.monthly_income, 0),
    coalesce(v_finance.savings_goal, 0),
    greatest(0, coalesce(v_finance.monthly_income, 0) - (v_variable_total + v_fixed_total)),
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
