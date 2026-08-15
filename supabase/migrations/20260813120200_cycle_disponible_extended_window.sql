-- Ciclo extendido · 3/5 — cycle_disponible con ventana extendida (gateada).
--
-- Esta es la "tercera mitad" que el doc no listaba. cycle_disponible es el
-- espejo server del saldo del cliente: alimenta el push "Buen día" y, vía
-- list_pending_notifications, todo el pipeline de notificaciones. Si el cliente
-- V2 estira la ventana y el servidor no, el push y la app dirían números
-- distintos durante TODA la extensión — exactamente el bug que
-- 20260728015707 (freeze de paridad app↔push) vino a matar.
--
-- Rama `nominal`: byte-idéntica a la vigente. Es la que usan TODAS las familias
-- del build de producción, porque solo el cliente V2 escribe cycle_model.
--
-- Rama `extended` (fixed + monthly únicamente):
--   · cobro pendiente  → [anchor, p_as_of + 1): el ciclo se estira hasta hoy.
--   · cobro confirmado → [anchor, payday_next): el ciclo nuevo arranca en la
--     FECHA DE CONFIRMACIÓN, no en el payday nominal.
--
-- Denominador durante la extensión: se usa la ventana estirada COMPLETA como
-- "días restantes" (days_remaining := days). Dos razones, ambas conservadoras:
--   1. el cupo diario baja a medida que la extensión crece — señal honesta de
--      que estás gastando de una olla que nadie está rellenando;
--   2. la proration de la presión de fijos queda en 1, o sea que los fijos del
--      ciclo se cuentan enteros. Sin esto, `days_remaining` valdría 1 y el
--      saldo se inflaría ignorando casi toda la presión.
--
-- Cambio adicional — filtro `archived_at` en la CTE `press`:
-- `press` (presión de fijos) no filtraba archivados, a diferencia de `spend`.
-- Es un bug latente: un pago ya contabilizado en un cierre podía volver a pesar
-- en una ventana viva. NO es un no-op universal — un banco de pruebas de 120
-- familias sintéticas × 40 fechas da 0 diferencias contra la función vigente
-- SIN archivados en ventana, y 88 CON ellos.
-- Se verificó contra producción que hoy ninguna de las 57 familias tiene un
-- gasto archivado con commitment_id dentro de su ventana viva (el archivado
-- solo ocurre al cerrar, y un cierre archiva ventanas ya terminadas), así que
-- el filtro no puede mover un número hoy. Se agrega por simetría con `spend` y
-- porque el archivado extendido hace más probable ese solape a futuro.

create or replace function public.cycle_disponible(
  p_family_id uuid,
  p_as_of date,
  p_tz text
)
returns table (
  daily_budget numeric,
  available_today numeric,
  raw_cycle_balance numeric,
  has_override boolean
)
language sql
stable
security definer
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
           ff.current_cycle_starting_balance::numeric as starting_balance,
           -- NUEVO: dato que faltaba para poder congelar como el cliente.
           ff.last_salary_confirmed_at,
           -- Gate del ciclo extendido (2026-08): solo el cliente V2 lo escribe.
           coalesce(ff.cycle_model, 'nominal') as cycle_model,
           -- Reloj ÚNICO de la función (DECISIÓN (a)). Nunca null: el default
           -- espeja a `user_local_timezone()`.
           coalesce(nullif(btrim(p_tz), ''), 'America/Argentina/Buenos_Aires') as tz
    from public.family_finance ff
    where ff.family_id = p_family_id
  ),
  mth as (
    -- Los tres meses que necesita `buildPayDate` del cliente.
    select
      (date_trunc('month', p_as_of) - interval '1 month') as m_prev,
      date_trunc('month', p_as_of)                        as m_cur,
      (date_trunc('month', p_as_of) + interval '1 month')  as m_next
  ),
  pay as (
    -- `buildPayDate(y, m, day)` del cliente: día CLAMPEADO a [1, último día DE
    -- ESE mes] (payday 31 en febrero → 28/29). Ver DECISIÓN (b).
    select f.*,
      (f.income_mode <> 'dynamic' or f.cycle_type = 'monthly') as monthly_window,
      make_date(
        extract(year from m.m_prev)::int,
        extract(month from m.m_prev)::int,
        least(
          greatest(1, f.salary_day::int),
          extract(day from (m.m_cur - interval '1 day'))::int
        )
      ) as payday_prev,
      make_date(
        extract(year from m.m_cur)::int,
        extract(month from m.m_cur)::int,
        least(
          greatest(1, f.salary_day::int),
          extract(day from (m.m_next - interval '1 day'))::int
        )
      ) as payday_this,
      make_date(
        extract(year from m.m_next)::int,
        extract(month from m.m_next)::int,
        least(
          greatest(1, f.salary_day::int),
          extract(day from (m.m_next + interval '1 month' - interval '1 day'))::int
        )
      ) as payday_next
    from f, mth m
  ),
  frz as (
    -- Espejo EXACTO de computeIsSalaryPendingConfirmation.
    select p.*,
      (
        p.income_mode <> 'dynamic'
        and p.cycle_type = 'monthly'
        and p_as_of >= p.payday_this
        and (
          p.last_salary_confirmed_at is null
          or (p.last_salary_confirmed_at at time zone p.tz)::date < p.payday_this
        )
      ) as is_salary_pending,
      -- El modelo extendido solo aplica al régimen mensual con cobro fijo:
      -- es el único que congela, y por lo tanto el único que puede estirarse.
      (
        p.cycle_model = 'extended'
        and p.income_mode <> 'dynamic'
        and p.cycle_type = 'monthly'
      ) as is_extended
    from pay p
  ),
  wb as (
    -- Ventana MENSUAL con la semántica del cliente (computeMonthAnchored).
    select z.*,
      case
        when z.is_extended then
          -- El anchor (fecha de confirmación) manda siempre que sea coherente
          -- con el mes en curso; si no, se cae al payday nominal.
          case when z.is_salary_pending then
                 case when z.current_cycle_anchor is not null
                       and z.current_cycle_anchor >= z.payday_prev
                       and z.current_cycle_anchor <= z.payday_this
                      then z.current_cycle_anchor else z.payday_prev end
               when p_as_of >= z.payday_this then
                 case when z.current_cycle_anchor is not null
                       and z.current_cycle_anchor >= z.payday_this
                       and z.current_cycle_anchor < z.payday_next
                      then z.current_cycle_anchor else z.payday_this end
               else
                 case when z.current_cycle_anchor is not null
                       and z.current_cycle_anchor >= z.payday_prev
                       and z.current_cycle_anchor < z.payday_this
                      then z.current_cycle_anchor else z.payday_prev end
          end
        when z.monthly_window then
          case when z.is_salary_pending then z.payday_prev
               when p_as_of >= z.payday_this then z.payday_this
               else z.payday_prev end
        else cp.cycle_start
      end as cycle_start,
      case
        when z.is_extended then
          -- Con el cobro pendiente la ventana se ESTIRA hasta hoy inclusive.
          case when z.is_salary_pending then (p_as_of + 1)
               when p_as_of >= z.payday_this then z.payday_next
               else z.payday_this end
        when z.monthly_window then
          case when z.is_salary_pending then z.payday_this
               when p_as_of >= z.payday_this then z.payday_next
               else z.payday_this end
        else cp.cycle_end_exclusive
      end as cycle_end
    from frz z
    cross join lateral public.compute_pay_cycle(
      p_as_of,
      case when z.income_mode = 'dynamic' then z.cycle_type else 'monthly' end,
      z.salary_day::smallint,
      z.cycle_anchor_date,
      z.cycle_length_days
    ) cp
  ),
  win as (
    select b.*,
      greatest(1, (b.cycle_end - b.cycle_start))::int as days,
      -- Durante la extensión no hay "restante": el ciclo termina hoy. Se usa
      -- la ventana entera para que la proration de fijos quede en 1 (presión
      -- completa) y el cupo diario baje al estirarse, en vez de dispararse.
      case when b.is_extended and b.is_salary_pending
           then greatest(1, (b.cycle_end - b.cycle_start))::int
           else greatest(1, (b.cycle_end - p_as_of))::int
      end as days_remaining,
      -- Objetivo del anchor del override — ver DECISIÓN (c).
      -- En extendido el override pertenece al ciclo que ARRANCÓ en el anchor,
      -- así que el objetivo es siempre el arranque de la ventana vigente.
      case when b.is_extended then b.cycle_start
           when b.is_salary_pending then b.payday_this
           else b.cycle_start end as anchor_target
    from wb b
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
      -- Bucketing por DÍA LOCAL del caller (DECISIÓN (a)).
      -- `archived_at is null` por simetría con `spend`: un gasto archivado ya
      -- fue contabilizado en un cierre y no debe volver a pesar en una ventana viva.
      select coalesce((select sum(e.price) from public.expenses e
        where e.commitment_id = fx.id
          and e.archived_at is null
          and e.created_at >= (w.cycle_start::timestamp at time zone w.tz)
          and e.created_at < (w.cycle_end::timestamp at time zone w.tz)), 0) as paid
    ) pic on true
  ),
  spend as (
    select
      coalesce((select sum(e.price) from public.expenses e
        where e.family_id = p_family_id and e.archived_at is null and e.commitment_id is null
          and e.created_at >= (w.cycle_start::timestamp at time zone w.tz)
          and e.created_at < (w.cycle_end::timestamp at time zone w.tz)), 0) as var_cycle,
      -- income_events.event_date ya es una FECHA local: fecha contra fecha.
      coalesce((select sum(ie.amount) from public.income_events ie
        where ie.family_id = p_family_id and ie.event_date >= w.cycle_start and ie.event_date < w.cycle_end), 0) as extra_income
    from win w
  ),
  calc as (
    select w.monthly_income, w.days, w.days_remaining, w.savings_goal, w.savings_goal_percent,
      (w.current_cycle_anchor = w.anchor_target and w.starting_balance is not null and w.starting_balance >= 0) as ov,
      (w.income_mode = 'dynamic') as dyn,
      w.starting_balance,
      p.paid_total,
      (p.paid_total + p.reserved_total) as pressure,
      s.var_cycle, s.extra_income
    from win w, press p, spend s
  ),
  res as (
    select c.*,
      case when c.ov then c.starting_balance when c.dyn then 0 else c.monthly_income end as eff_income,
      case when (c.ov or c.dyn) then greatest(1, c.days_remaining) else greatest(1, c.days) end as eff_days,
      (c.ov and c.starting_balance < c.monthly_income) as ov_down
    from calc c
  ),
  res2 as (
    select r.*,
      case when r.ov_down then greatest(1, r.days_remaining)::numeric / greatest(1, r.days) else 1 end as proration,
      case when r.dyn then 0
           when r.ov_down then greatest(0, round(r.eff_income * (r.savings_goal_percent / 100)))
           else r.savings_goal end as eff_savings,
      r.var_cycle as var_metrics
    from res r
  )
  select
    case when (r.ov or r.dyn)
      then greatest(0, round(greatest(0, round((r.eff_income - r.eff_savings - (r.pressure * r.proration) - r.var_metrics) + r.extra_income)) / greatest(1, r.eff_days)))
      else greatest(0, round(greatest(0, round(r.eff_income - r.pressure - r.eff_savings)) / greatest(1, r.eff_days)))
    end::numeric as daily_budget,
    greatest(0, round((r.eff_income - r.eff_savings - (r.paid_total * r.proration) - r.var_metrics) + r.extra_income))::numeric as available_today,
    round((r.eff_income - r.eff_savings - (r.paid_total * r.proration) - r.var_metrics) + r.extra_income)::numeric as raw_cycle_balance,
    r.ov as has_override
  from res2 r;
$function$;

-- Misma cerradura que la versión vigente: server-side only.
revoke execute on function public.cycle_disponible(uuid, date, text)
  from public, anon, authenticated;
