-- Fix de paridad cliente↔SQL: `cycle_disponible` no congelaba la ventana del
-- ciclo mientras el sueldo del mes seguía sin confirmar ("vencido"), y además
-- bucketeaba el calendario (payday y gastos) con relojes distintos a los del
-- device.
--
-- ── EL BUG ──────────────────────────────────────────────────────────────────
-- El CLIENTE congela: `computeIsSalaryPendingConfirmation` (mobile/utils/
-- pay-cycle.ts) + `getCurrentPayCycle(today, config, pending)` +
-- `computeMonthlyAccountingWindow(..., freeze && pending)`. Mientras el cobro
-- del mes no se confirma, el saldo/cupo que ve el usuario sigue siendo el del
-- ciclo ANTERIOR.
-- `cycle_disponible` derivaba su ventana de `compute_pay_cycle(p_as_of, ...)`,
-- que ni siquiera recibe `last_salary_confirmed_at` → el día del payday saltaba
-- al ciclo NUEVO (vacío, con el ingreso entero) aunque el user no hubiera
-- confirmado. Como el push "Buen día" (`list_pending_notifications`,
-- kind `checkin_morning`) consume `cycle_disponible`, la notificación anunciaba
-- un disponible que la app NO mostraba.
--
-- Caso real (prod, familia 61bdc187-…, payday 20, fixed/monthly, último confirm
-- 2026-06-22 AR, as_of 2026-07-24):
--   · SQL (ventana nueva 20-jul→20-ago): raw_cycle_balance ≈ 5.790.000
--   · App (ventana congelada 20-jun→20-jul): ≈ 1.277.000
-- Con este fix la SQL sobre la ventana congelada da 1.277.211 → paridad.
--
-- ── ALCANCE ─────────────────────────────────────────────────────────────────
-- `compute_pay_cycle` NO se modifica (la comparten home_snapshot, velocity,
-- try_close_previous_cycle, user_current_cycle_start…): todo se resuelve DENTRO
-- de `cycle_disponible`. El resto del cuerpo (eff_income, savings, proration,
-- var_metrics, extra_income, daily_budget) es idéntico a la definición vigente
-- (20260708170000_dynamic_income_close_defensives.sql, verificada contra
-- pg_get_functiondef de prod 2026-07-24: sin drift). Cambian SOLO:
--   1. `f` suma `last_salary_confirmed_at`.
--   2. CTEs nuevas `mth` / `pay` / `frz` (paydays clampeados + is_salary_pending).
--   3. `win` calcula la ventana MENSUAL con la semántica del cliente —
--      congelada o no— y deja `compute_pay_cycle` solo para los ciclos rolling
--      del modo dinámico (ver DECISIÓN (b)).
--   4. `has_override` compara el anchor contra `anchor_target` (ver DECISIÓN (c)).
--   5. Los boundaries de gasto se anclan a la MISMA tz que el resto de la
--      función (ver DECISIÓN (a)).
--   6. Firma nueva `(uuid, date, text)` con la tz del caller; la de 2 args queda
--      como shim con la tz por defecto (AR) para no romper contratos.
--   7. `list_pending_notifications` (único consumidor) pasa la tz del usuario y
--      alinea su flag `confirmado` al mismo predicado (ver DECISIÓN (d)).
--
-- ── DECISIÓN (a) · UNA sola tz, la del caller ───────────────────────────────
-- El cliente compara SIEMPRE en el calendario local del device:
--   · confirm  → `normalizeToStartOfDay(new Date(value)) < payDate`
--   · gastos   → `normalizeToStartOfDay(new Date(created_at))` dentro de
--                `[start, end)` (commitment-cycle-summary.ts:32-38 y
--                family-dashboard-model.ts:145)
-- La versión anterior de este fix mezclaba relojes: el confirm anclado a
-- 'America/Argentina/Buenos_Aires' HARDCODEADO y los dos bucketeos de gasto
-- (`press` y `spend`) en `::timestamptz`, o sea la tz de SESIÓN (= UTC en prod)
-- → medianoche UTC = 21:00 AR del día anterior. Dos bugs distintos:
--   · para un usuario AR, un gasto de las 21:00–23:59 del día previo al inicio
--     del ciclo entraba en la ventana SQL y no en la del device (y viceversa en
--     el borde de cierre) — mismo sesgo nocturno que motivó el fix del rollup
--     `close_monthly_cycle.daily_totals` (20260722174332);
--   · para los usuarios FUERA de AR (hay 9 en prod: Lima ×2, Sao_Paulo,
--     Santiago, Santo_Domingo, Coyhaique, Caracas, Los_Angeles, Bogota) el
--     confirm se fechaba en AR mientras `p_as_of` ya venía en la tz del usuario
--     (`list_pending_notifications` lo calcula con
--     `(now() at time zone user_local_timezone(user_id))::date`), así que
--     `is_salary_pending` podía salir al revés que en el device — y como
--     `last_salary_confirmed_at` no se vuelve a estampar (la app se cree
--     confirmada y no re-promptea), la divergencia duraba un CICLO ENTERO, no
--     "unas horas".
-- Solución: `p_tz` explícito. `list_pending_notifications` ya tiene la tz del
-- usuario en scope (`tz.user_tz`) y se la pasa, de modo que las DOS mitades de
-- cada comparación (p_as_of y el bucketing) usan el MISMO calendario. La firma
-- vieja `(uuid, date)` sigue existiendo como shim con
-- 'America/Argentina/Buenos_Aires' (el mismo default de `user_local_timezone`),
-- así que los callers ad-hoc (supabase/tests/e2e-backend.sql, el test de
-- paridad, psql manual) no se enteran.
-- (Follow-up fuera de alcance: `home_snapshot` (`v_last_confirmed::date`) sigue
--  comparando en tz de sesión; conviene alinearlo en su propia migración.)
--
-- ── DECISIÓN (b) · semántica del payday: FECHA con clamp (la del cliente) ───
-- `compute_pay_cycle` NO espeja al cliente en dos puntos:
--   1. elige la rama del mes con `extract(day from p_today) >= v_day`, o sea
--      comparando el NÚMERO de día contra el payday SIN clampear, mientras el
--      cliente compara FECHAS con el payday ya clampeado al último día del mes
--      (`buildPayDate`: min(max(1, day), lastDayOfMonth));
--   2. deriva el fin como `cycle_start + interval '1 month'` sobre un start que
--      YA fue clampeado, mientras el cliente vuelve a clampear en el mes
--      siguiente (`buildPayDate(start.year, start.month + 1, day)`).
-- Efecto medido contra prod con salary_day=31: as_of 2026-03-30 →
-- [2026-02-28, 2026-03-28), una ventana que ni siquiera CONTIENE p_as_of (el
-- cliente da [2026-02-28, 2026-03-31)); as_of 2026-02-28 → [2026-01-31,
-- 2026-02-28) contra [2026-02-28, 2026-03-31) del cliente: ciclos distintos.
-- Y cuando la ventana devuelta ya TERMINÓ (p_as_of >= cycle_end_exclusive), el
-- `days_remaining` colapsa a 1 por el `greatest(1, …)` → para un hogar dinámico
-- o con override, `eff_days = 1` → el cupo diario del push pasa a ser TODO el
-- discrecional del ciclo. En prod hay exposición viva: la familia
-- bb05f4b2-978c-4696-9b58-3292ef817042 tiene salary_payment_day=31 +
-- income_mode='dynamic' (el dinámico nunca congela) → le pega el 30-mar y el
-- 30-abr.
-- Por eso acá la ventana MENSUAL —congelada o no— se calcula con la semántica
-- del CLIENTE (fecha + clamp en los tres meses: previo, actual y siguiente), y
-- `compute_pay_cycle` queda SOLO para los ciclos rolling (dinámico
-- weekly/biweekly/custom), donde su lógica sí es idéntica a `computeRollingN`.
-- Arreglar `compute_pay_cycle` en sí sigue fuera de alcance (lo comparten otros
-- consumidores y merece su propia migración + revisión de cada call-site).
--
-- ── DECISIÓN (c) · anchor del override durante el freeze ────────────────────
-- El cliente NO compara el anchor guardado contra el inicio de la ventana
-- congelada: `family-dashboard-model.ts` usa
--   cycleAnchorTarget = isSalaryPendingConfirmation ? currentMonthPayDate
--                                                   : payCycle.start
-- (a propósito: durante el freeze el prompt de saldo inicial tiene que volver a
-- dispararse). Si acá dejáramos el `current_cycle_anchor = cycle_start` literal
-- sobre la ventana congelada, el override del ciclo ANTERIOR reviviría y
-- rompería la paridad justo en el caso que este fix viene a arreglar: en la
-- familia real, `ov` pasaría a true (anchor 2026-06-20 = inicio congelado) →
-- eff_income = starting_balance y eff_days = días RESTANTES (=1) → raw
-- 1.416.318 y un cupo diario absurdo, contra los 1.277.211 que muestra la app.
-- Por eso el anchor se compara contra `anchor_target`, que espeja al cliente:
-- payday de ESTE mes si está congelado, `cycle_start` si no (idéntico al
-- comportamiento previo cuando no hay freeze).
-- OJO con el borde clampeado: cuando el freeze arranca, `anchor_target` NO es
-- el inicio de la ventana. Ej. salary_day=31, as_of 28-feb, congelado: la
-- ventana es [31-ene, 28-feb) pero `anchor_target` = 28-feb (= payday_this
-- clampeado). O sea el freeze NUNCA es un no-op, ni siquiera cuando la ventana
-- coincide con la de otra fórmula: `has_override` (y con él `eff_income`,
-- `eff_days`, `proration`) puede invertirse respecto del camino no congelado.
-- Es el comportamiento CORRECTO —lo verificado contra el cliente— pero el borde
-- existe y hoy no lo cubre ningún test: en prod la única familia con
-- salary_payment_day > 28 es dinámica (no congela).
--
-- ── DECISIÓN (d) · el consumidor se alinea en el MISMO push ─────────────────
-- `list_pending_notifications` decide el CUERPO del push con su propio flag
-- `confirmado` (`last_salary_confirmed_at >= c.cycle_start::timestamptz`:
-- medianoche en tz de SESIÓN = UTC). Con el freeze nuevo, los dos predicados
-- podían ser true a la vez → el push tomaba la rama "ya cobraste, mirá tu cupo"
-- con los números del ciclo CONGELADO (el anterior, ya consumido), mientras la
-- app seguía mostrando el prompt "¿Ya cobraste?". Se solapan cuando el confirm
-- cae del lado equivocado de la medianoche del payday (con TimeZone=UTC en
-- prod: 21:00–23:59 AR de la víspera).
-- Se parchea acá, en el mismo push: `confirmado` pasa a evaluarse en la tz del
-- usuario (`(last_salary_confirmed_at at time zone c.user_tz)::date >=
-- c.cycle_start`), que es exactamente el complemento de `is_salary_pending`
-- cuando `today_local >= payday` — el CTE `cycle` de esa función ya calcula su
-- `cycle_start` con el payday CLAMPEADO, así que ambos lados hablan del mismo
-- día. Y la llamada pasa a `cycle_disponible(family_id, today_local, user_tz)`.
-- Se hace por text-patch sobre `pg_get_functiondef` (la función tiene drift
-- histórico respecto de las migraciones y son ~340 líneas), con guards que
-- abortan si los patrones no aparecen exactamente una vez.

-- ── 1. La función real, con la tz del caller ────────────────────────────────
create or replace function public.cycle_disponible(p_family_id uuid, p_as_of date, p_tz text)
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
           ff.current_cycle_starting_balance::numeric as starting_balance,
           -- NUEVO: dato que faltaba para poder congelar como el cliente.
           ff.last_salary_confirmed_at,
           -- Reloj ÚNICO de la función (DECISIÓN (a)). Nunca null: el default
           -- espeja a `user_local_timezone()`. Un nombre de tz inválido explota
           -- igual que hoy en el caller (que ya hace `now() at time zone
           -- user_tz`), así que no agrega modos de falla nuevos.
           coalesce(nullif(btrim(p_tz), ''), 'America/Argentina/Buenos_Aires') as tz
    from public.family_finance ff
    where ff.family_id = p_family_id
  ),
  mth as (
    -- Los tres meses que necesita `buildPayDate` del cliente: el previo (inicio
    -- del ciclo cuando todavía no llegó el payday), el de p_as_of y el
    -- siguiente (fin del ciclo cuando ya arrancó).
    select
      (date_trunc('month', p_as_of) - interval '1 month') as m_prev,
      date_trunc('month', p_as_of)                        as m_cur,
      (date_trunc('month', p_as_of) + interval '1 month')  as m_next
  ),
  pay as (
    -- `buildPayDate(y, m, day)` del cliente: día del mes CLAMPEADO a
    -- [1, último día DE ESE mes] (payday 31 en febrero → 28/29). Ver DECISIÓN (b).
    select f.*,
      -- La ventana es "mensual anclada al salary_day" para todos los hogares
      -- fixed y para los dinámicos con cycle_type='monthly'; el resto (rolling
      -- del dinámico) va por compute_pay_cycle.
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
    -- Espejo EXACTO de computeIsSalaryPendingConfirmation(config, today,
    -- lastConfirmedAt, incomeMode):
    --   · dinámico → false (no hay sueldo que confirmar)
    --   · cycle_type <> 'monthly' → false (rolling no congela). El CHECK
    --     family_finance_cycle_config_valid garantiza que los tipos rolling
    --     siempre traen anchor+length, así que el fallback a 'monthly' de
    --     `financeToCycleConfig` (config incompleta) no es alcanzable en DB y
    --     el cycle_type crudo alcanza como gate.
    --   · p_as_of < payday del mes → false
    --   · nunca confirmado (null) → TRUE
    --   · día local del confirm < payday del mes → TRUE  (tz: DECISIÓN (a))
    select p.*,
      (
        p.income_mode <> 'dynamic'
        and p.cycle_type = 'monthly'
        and p_as_of >= p.payday_this
        and (
          p.last_salary_confirmed_at is null
          or (p.last_salary_confirmed_at at time zone p.tz)::date < p.payday_this
        )
      ) as is_salary_pending
    from pay p
  ),
  wb as (
    -- Ventana MENSUAL con la semántica del cliente (computeMonthAnchored):
    --   · freeze (sueldo del mes sin confirmar) → [payday_prev, payday_this)
    --   · hoy >= payday_this                    → [payday_this, payday_next)
    --   · hoy <  payday_this                    → [payday_prev, payday_this)
    -- Los tres paydays están CLAMPEADOS en su propio mes, así que no hereda
    -- ninguna de las dos divergencias de compute_pay_cycle (DECISIÓN (b)).
    -- Los ciclos ROLLING del dinámico siguen por el helper central, cuya rama
    -- no-monthly sí es idéntica a `computeRollingN` del cliente.
    select z.*,
      case when z.monthly_window then
             case when z.is_salary_pending then z.payday_prev
                  when p_as_of >= z.payday_this then z.payday_this
                  else z.payday_prev end
           else cp.cycle_start end as cycle_start,
      case when z.monthly_window then
             case when z.is_salary_pending then z.payday_this
                  when p_as_of >= z.payday_this then z.payday_next
                  else z.payday_this end
           else cp.cycle_end_exclusive end as cycle_end
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
      -- days == PayCycle.days del cliente (diferencia de fechas); days_remaining
      -- == max(1, ceil((end - today)/DAY)) de computeMonthlyAccountingWindow.
      -- Congelado, cycle_end <= p_as_of → days_remaining = 1, igual que el
      -- cliente.
      greatest(1, (b.cycle_end - b.cycle_start))::int as days,
      greatest(1, (b.cycle_end - p_as_of))::int as days_remaining,
      -- Objetivo del anchor del override — ver DECISIÓN (c).
      case when b.is_salary_pending then b.payday_this else b.cycle_start end as anchor_target
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
      -- Bucketing por DÍA LOCAL del caller (DECISIÓN (a)): medianoche de
      -- cycle_start/cycle_end EN p_tz, no en la tz de sesión.
      select coalesce((select sum(e.price) from public.expenses e
        where e.commitment_id = fx.id
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
      -- income_events.event_date ya es una FECHA local (la escribe el device),
      -- así que se compara fecha contra fecha: sin tz de por medio.
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

comment on function public.cycle_disponible(uuid, date, text) is
  'Cupo/saldo canónicos del ciclo para p_as_of (fecha local del caller) evaluados ENTEROS en p_tz: día del confirm y bucketing de gastos. Espeja el cálculo del cliente, incluido el FREEZE por sueldo sin confirmar (ventana = ciclo anterior mientras el confirm es < payday del mes) y el payday CLAMPEADO al último día del mes (buildPayDate). Interna: revocada para public/anon/authenticated.';

-- ── 2. Shim de compatibilidad: la firma vieja, con la tz por defecto ────────
-- La conservan supabase/tests/e2e-backend.sql, el test de paridad y cualquier
-- llamada manual. Default = el mismo de `user_local_timezone()`.
create or replace function public.cycle_disponible(p_family_id uuid, p_as_of date)
 returns table(daily_budget numeric, available_today numeric, raw_cycle_balance numeric, has_override boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select d.daily_budget, d.available_today, d.raw_cycle_balance, d.has_override
  from public.cycle_disponible(p_family_id, p_as_of, 'America/Argentina/Buenos_Aires') d;
$function$;

comment on function public.cycle_disponible(uuid, date) is
  'Shim de compatibilidad: cycle_disponible(family, as_of) con tz America/Argentina/Buenos_Aires. Los callers que conocen la tz del usuario deben usar la variante de 3 argumentos. Interna: revocada para public/anon/authenticated.';

-- Funciones internas (las consumen list_pending_notifications y crons vía
-- service_role). Se re-afirman los revokes de 20260629160000 para que un replay
-- limpio de migraciones no deje EXECUTE abierto a PUBLIC.
revoke all on function public.cycle_disponible(uuid, date) from public;
revoke all on function public.cycle_disponible(uuid, date) from anon;
revoke all on function public.cycle_disponible(uuid, date) from authenticated;
revoke all on function public.cycle_disponible(uuid, date, text) from public;
revoke all on function public.cycle_disponible(uuid, date, text) from anon;
revoke all on function public.cycle_disponible(uuid, date, text) from authenticated;

-- ── 3. El consumidor, alineado al mismo reloj (DECISIÓN (d)) ────────────────
-- Text-patch sobre la definición VIVA (la función tiene drift histórico y son
-- ~340 líneas; duplicarlas acá sería peor). Idempotente: si ya está parchada,
-- no hace nada. Si no encuentra los patrones, aborta la migración.
do $mig$
declare
  v_def text;
  v_old_conf constant text :=
    'c.last_salary_confirmed_at >= c.cycle_start::timestamptz';
  v_new_conf constant text :=
    '(c.last_salary_confirmed_at at time zone c.user_tz)::date >= c.cycle_start';
  v_old_call constant text :=
    'public.cycle_disponible(c.family_id, c.today_local)';
  v_new_call constant text :=
    'public.cycle_disponible(c.family_id, c.today_local, c.user_tz)';
  v_cnt_conf int;
  v_cnt_call int;
begin
  v_def := pg_get_functiondef('public.list_pending_notifications(text)'::regprocedure);

  v_cnt_conf := (length(v_def) - length(replace(v_def, v_old_conf, ''))) / length(v_old_conf);
  -- Primero la detección de "ya aplicada": ninguno de los dos patrones viejos
  -- presente y el nuevo sí. Un estado MIXTO (uno parchado y el otro no) cae en
  -- los guards de abajo y aborta.
  v_cnt_call := (length(v_def) - length(replace(v_def, v_new_call, ''))) / length(v_new_call);

  if v_cnt_conf = 0 and v_cnt_call > 0 then
    raise notice 'list_pending_notifications ya alineada a la tz del usuario; nada que hacer.';
    return;
  end if;

  if v_cnt_conf <> 1 then
    raise exception 'Abort alineacion de list_pending_notifications: se esperaba exactamente 1 ocurrencia de "%", se encontraron %', v_old_conf, v_cnt_conf;
  end if;

  v_cnt_call := (length(v_def) - length(replace(v_def, v_old_call, ''))) / length(v_old_call);
  if v_cnt_call <> 1 then
    raise exception 'Abort alineacion de list_pending_notifications: se esperaba exactamente 1 ocurrencia de "%", se encontraron %', v_old_call, v_cnt_call;
  end if;

  v_def := replace(v_def, v_old_conf, v_new_conf);
  v_def := replace(v_def, v_old_call, v_new_call);
  execute v_def;
end $mig$;
