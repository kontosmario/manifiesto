-- Cupo diario consistente con el saldo del mes (fix del "disponible diario"
-- inflado con override).
--
-- Bug: con override activo, el saldo del mes (available_today) resta el gasto
-- variable ya hecho, pero el cupo diario (daily_budget) usaba el numerador
-- BRUTO (eff_income − pressure − eff_savings) SIN restar el variable, dividido
-- por los días restantes. Resultado: cupo × días_restantes > saldo del mes — el
-- cupo re-ofrecía como disponible plata ya gastada (kontosmario: 268.763/día
-- prometía 5,38M cuando el saldo real era 3,70M; overshoot = todo el variable
-- ya gastado). El push "Buen día" (checkin_morning) consume esta misma RPC, así
-- que el número inflado también viajaba a la notificación.
--
-- Fix: con override, daily_budget = available_today / días_restantes (mismo
-- numerador que el saldo). Consistente por construcción: cupo × días_restantes
-- = saldo del mes, nunca lo supera. Espeja el cliente 1:1
-- (cycle-disponible.ts, gateado en hasCycleOverride).
--
-- SIN override NO cambia nada: se mantiene el objetivo plano del mes
-- (libreMes / días totales) — no resta variable, es un target por día, no un
-- saldo restante. Único cambio: la expresión de daily_budget (gateada en r.ov).

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
           ff.current_cycle_starting_balance::numeric as starting_balance,
           ff.last_salary_confirmed_at
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
      coalesce((select sum(e.price) from public.expenses e
        where e.family_id = p_family_id and e.archived_at is null and e.commitment_id is null
          and e.created_at >= coalesce(w.last_salary_confirmed_at, w.cycle_start::timestamptz)
          and e.created_at < w.cycle_end::timestamptz), 0) as var_since_confirm,
      coalesce((select sum(ie.amount) from public.income_events ie
        where ie.family_id = p_family_id and ie.event_date >= w.cycle_start and ie.event_date < w.cycle_end), 0) as extra_income
    from win w
  ),
  calc as (
    select w.monthly_income, w.days, w.days_remaining, w.savings_goal, w.savings_goal_percent,
      (w.current_cycle_anchor = w.cycle_start and w.starting_balance is not null and w.starting_balance >= 0) as ov,
      w.starting_balance, (p.paid_total + p.reserved_total) as pressure,
      s.var_cycle, s.var_since_confirm, s.extra_income
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
      case when r.ov then r.var_since_confirm else r.var_cycle end as var_metrics
    from res r
  )
  select
    -- Cupo diario: con override espeja el saldo (available_today / días
    -- restantes); sin override, objetivo plano del mes (libreMes / días
    -- totales), sin restar variable.
    case when r.ov
      then greatest(0, round(greatest(0, round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income)) / greatest(1, r.eff_days)))
      else greatest(0, round(greatest(0, round(r.eff_income - r.pressure - r.eff_savings)) / greatest(1, r.eff_days)))
    end::numeric as daily_budget,
    greatest(0, round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income))::numeric as available_today,
    round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income)::numeric as raw_cycle_balance,
    r.ov as has_override
  from res2 r;
$function$;
