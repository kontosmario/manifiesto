import { useMemo } from 'react'
import { useCategories } from '@/features/categories/use-categories'
import {
  summarizeFijos,
  type FijoHikeAlert,
  type FijoItem,
} from '@/features/fijos/fijos-aggregates.model'
import { useMonthlyExpenseComparison } from '@/features/home/use-monthly-expense-comparison'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import { useCycleIncomeEventsTotal } from '@/features/income/use-income-events'
import {
  useCurrentCycleAcumulado,
  type CycleAcumulado,
} from '@/features/month-close/use-current-cycle-acumulado'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { computeCycleDisponible } from '@/features/family/cycle-disponible'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'
import { computeOpeningDailyBudget } from '@/features/home/derive-gauge-state'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import {
  isHikeDismissed,
  useDismissedHikes,
} from '@/features/fijos/use-hike-dismiss-store'
import i18n from '@/lib/i18n'
import { getDateTimeFormat, getIntlLocale } from '@/lib/i18n/active-locale'

const MONTH_SHORT_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short' }

function formatCycleLabel(start: Date, end: Date): string {
  const fmt = getDateTimeFormat(MONTH_SHORT_OPTIONS)
  const s = `${start.getDate()} ${fmt.format(start)}`
  const e = `${end.getDate()} ${fmt.format(end)}`
  return `${s} → ${e}`
}

export type HomeAlertType = 'upcoming_fixed' | 'zombie_subscription' | 'price_hike'
export type HomeAlertUrgency = 'high' | 'medium' | 'low'

export interface HomeAlert {
  id: string
  type: HomeAlertType
  title: string
  subtitle: string
  actionLabel: string
  actionRoute: string
  urgency: HomeAlertUrgency
}

export interface HomeHeroMetrics {
  availableToday: number
  /**
   * Saldo del ciclo SIN clampear. `availableToday` está clampeado a 0, así que
   * un hogar que se pasó del plan es indistinguible de uno que quedó justo:
   * los dos leen "$0". El hero (y SOLO el hero) usa este valor para dibujar el
   * estado "te pasaste" con el monto real; todo el resto sigue con el clamp.
   */
  rawCycleBalance: number
  /**
   * `true` mientras algún insumo del saldo está en su PRIMERA carga (la suma
   * de income extra no tiene seed en home_snapshot, así que llega después que
   * el resto). La variante 'over' del hero se gatea con esto: hasta que el
   * monto termina de cargar, un rawCycleBalance negativo es probablemente un
   * artefacto de hidratación, no el estado real del hogar.
   */
  balanceHydrating: boolean
  cycleDay: number
  cycleTotalDays: number
  cycleMonth: string
  dailyBudget: number
  /**
   * `true` cuando el cupo se compuso por la rama que YA descontó el gasto
   * variable del ciclo (override de saldo o ingreso dinámico). El medidor del
   * hero lo necesita para no restar el gasto de hoy dos veces; ver
   * `derive-gauge-state` y `add-expense-impact`.
   */
  cupoNetsSpend: boolean
  /**
   * Gasto VARIABLE de hoy y cupo de APERTURA del día (lo que había para hoy
   * antes de gastar). Son los dos números con los que el hero arma el medidor
   * — y los MISMOS que consume el "revisá el impacto" del alta de gasto, para
   * que las dos pantallas no puedan mostrar cuentas distintas del mismo gasto.
   */
  spentToday: number
  openingDailyBudget: number
  discretionaryRaw: number
  projectedClose: number
  /**
   * `true` when the user reported a cycle-specific available amount
   * different from the recurring salary. The hero tags the daily-cap
   * tile as "ajustado" so the user understands why this cycle's
   * cupo is calculated against a different baseline.
   */
  cycleAdjusted: boolean
  /**
   * `true` when payday has arrived but the user hasn't confirmed it
   * yet. The hero swaps the neutral "día N de M" pill for a warning
   * pill that surfaces the days overdue and prompts the cycle sheet.
   */
  paydayPending: boolean
  /**
   * Days elapsed since the unconfirmed payday. 0 when payday is
   * literally today, 1+ when the user is late confirming. Only
   * meaningful when `paydayPending === true`.
   */
  paydayDaysOverdue: number
  /**
   * `true` when there's enough cycle history to project the closing
   * balance with confidence (≥4 elapsed days). On day 1–3 the daily
   * average swings wildly with each new expense, so the hero hides
   * the projected number and shows a "Aprendiendo tu ritmo…" state
   * instead of misleading the user with volatile numbers.
   */
  projectionReliable: boolean
  /**
   * `true` when the family has set a monthly income (>0) OR runs in
   * dynamic income mode (no fixed salary; funded by income_events).
   * When false the entire downstream math collapses to zero and the
   * hero shows a setup CTA instead of "$0 disponible".
   */
  incomeConfigured: boolean
  /**
   * Régimen de ingreso del hogar. En 'dynamic' el hero reemplaza el
   * setup de sueldo por el estado "Cargá tu primer ingreso" (CTA a
   * add-income) mientras no haya ingresos en el ciclo.
   */
  incomeMode: 'fixed' | 'dynamic'
  /**
   * `true` cuando el ciclo ya tiene income_events cargados. Junto a
   * `incomeMode === 'dynamic'` decide si el hero muestra métricas o
   * el estado vacío "Cargá tu primer ingreso".
   */
  hasCycleIncome: boolean
  /**
   * `true` mientras la query de ingresos del ciclo hidrata en modo
   * dinámico (home_snapshot no seedea esa key). El hero NO debe decidir
   * el estado vacío con el dato ausente — sin este flag, un dinámico
   * CON ingresos flasheaba "Cargá tu primer ingreso" en cold start
   * (espejo de `dynamicIncomeHydrating` de Control).
   */
  cycleIncomeHydrating: boolean
  /**
   * Sueldo mensual base — usado por el hero para mostrar el breakdown
   * "$X sueldo · $Y acumulado de mayo" cuando `acumulado != null`.
   * Siempre poblado (0 cuando `incomeConfigured === false`).
   */
  monthlyIncome: number
  /**
   * Cuando el `current_cycle_starting_balance` proviene de una decisión
   * "acumular" del mes anterior, contiene el monto + label del periodo
   * origen para mostrar contexto positivo ("+$2.2M acumulado de mayo")
   * en lugar del chip neutral "Ajustado para este mes". `null` cuando
   * el saldo del cycle no viene de un acumular (sea por override
   * manual del user o por estado default).
   */
  acumulado: CycleAcumulado | null
  /**
   * Reserva acumulada del cierre de meses anteriores (Spec B —
   * decisión "Guardar como reserva" en el wrapped). Lee directo
   * `family_finance.monthly_reserve_amount` (numeric, viene como
   * string vía PostgREST). Se surface en el hero como chip indigo
   * read-only para que la plata no desaparezca visualmente, y en
   * Settings como sección. 0 cuando todavía no hay ningún mes
   * guardado como reserva.
   */
  monthlyReserveAmount: number
  /**
   * Diferencia `current_cycle_starting_balance - monthly_income`
   * cuando hay override activo (cycleAdjusted == true), 0 cuando no.
   *
   *   > 0 = balance subió respecto del sueldo (sumar reserva al mes,
   *         cobro extra, acumular del mes pasado, etc). El hero
   *         muestra chip indigo "+\$X sumado al mes" en vez del peach
   *         "Ajustado para este mes" (que implicaba correción down).
   *   < 0 = balance bajó respecto del sueldo (cobro menor de lo
   *         esperado, e.g. quincena adelantada). El hero mantiene
   *         el chip peach "Ajustado para este mes".
   *   = 0 = balance == sueldo exacto (raro — equivalente al estado
   *         default sin override).
   */
  cycleBalanceDiff: number
  /**
   * Monto de gastos FIJOS que vencen este ciclo y todavía NO se pagaron
   * (`effectiveCommitmentReserved`, prorrateado). El SALDO del mes es plata
   * REAL: resta solo los fijos PAGADOS + variable, así que este pendiente
   * TODAVÍA está en el saldo. El hero lo surface como chip "te faltan $X de
   * fijos" para avisar que parte del saldo está comprometido — el CUPO diario
   * sí lo reserva (no te deja gastarlo). 0 cuando no queda ningún fijo por pagar.
   */
  fixedPendingReserved: number
}

export interface HomeMonthSummary {
  variableTotal: number
  variableCount: number
  /** Delta en fracción — 0.12 = +12%. `null` cuando no hay base comparativa. */
  variableTrend: number | null
  fixedTotal: number
  fixedPaid: number
  fixedCount: number
  /**
   * Fijos VENCIDOS del ciclo (clasificación canónica de `summarizeFijos`,
   * ventana del ciclo REAL). La Home rediseñada lo usa para el tono
   * "vencido" de la fila FIJOS (catálogo §6); la vieja no lo consume.
   */
  fixedOverdue: number
  /**
   * `false` mientras la query de PAGOS del ciclo no resolvió.
   *
   * `fixedTotal`/`fixedCount` salen de los fijos y son estables, pero el
   * REPARTO (pagado / pendiente / vencido) sale de los pagos: sin ellos
   * `summarizeFijos` ve cero pagos y clasifica como impago TODO lo que ya
   * pasó su fecha. O sea que en un arranque en frío la Home no sólo mostraba
   * "0 de N pagados" antes de saltar al número real — podía anunciar
   * "3 vencidos" que no existen. El consumidor omite esas dos afirmaciones
   * hasta que esto sea `true` (ver `fijosVM` en `neo-home-screen`).
   *
   * Se mide con `isLoading` y no con `isFetched`: la query está `enabled`
   * sólo con ≥1 fijo persistido, así que en una familia sin fijos nunca
   * corre y su `isFetched` quedaría en `false` para siempre. En RQ v5 una
   * query deshabilitada tiene `isLoading: false` — mismo criterio que el
   * gate de la pantalla de Fijos.
   */
  fixedPaymentsReady: boolean
}

export interface HomeGoalMetrics {
  id: string
  name: string
  emoji: string
  current: number
  target: number
  contributionThisMonth: number
  projectedMonthContribution: number
  originalMonthsRemaining: number
  projectedMonthsRemaining: number
}

export interface HomeMetrics {
  hero: HomeHeroMetrics
  alerts: HomeAlert[]
  monthSummary: HomeMonthSummary
  goal: HomeGoalMetrics | null
}

/**
 * Aggregates every piece of data rendered by the redesigned Home
 * sections (hero, alerts, month-summary, goal) into a single memoized
 * object. Data sources are the existing hooks — no new tables, no new
 * endpoint. The result shape mirrors the spec so each component can
 * consume its slice directly.
 */
export function useHomeMetrics(familyId: string): HomeMetrics {
  const dashboard = useFamilyDashboard(familyId)
  // Modelo de dos planos: el SALDO usa el dashboard congelado (default),
  // pero las OBLIGACIONES (fijos: pagos + clasificación + próximo a vencer)
  // van en TIEMPO REAL aunque el cobro no esté confirmado — si no, la card
  // del Home mostraría "Todos pagados" del ciclo viejo en vez de los
  // próximos a vencer. Mismo desacople que use-fijos-controller.
  const { cycle: realCycle } = usePayCycle(familyId, { freeze: false })
  const realMonthly = useMonthlyAccounting(familyId, { freeze: false })
  const categoriesQuery = useCategories(familyId, 'fixed_expense')
  const comparisonQuery = useMonthlyExpenseComparison(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  // One-time income events that fall inside the current accounting
  // month — bumps `availableToday` y `projectedClose` (ambos son
  // métricas de saldo del mes, no del cobro). Para monthly users
  // coincide con el salary cycle; para no-monthly es el mes calendario.
  const cycleIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    formatLocalDateKey(dashboard.monthlyAccounting.start),
    formatLocalDateKey(dashboard.monthlyAccounting.end),
  )
  const cycleExtraIncome = cycleIncomeQuery.data ?? 0
  // Cuando el saldo del cycle viene de "acumular" del mes anterior,
  // el hero muestra breakdown explícito + chip verde en lugar del
  // chip neutral "Ajustado". El hook matchea la decisión vigente
  // contra el INICIO del ciclo actual (self-correcting al avanzar).
  // FIJO: el inicio lo representa `current_cycle_anchor` (lo estampa
  // "Ya cobré" — antes de confirmar, el chip espera: by design).
  // DINÁMICO: no hay cobro que estampe el anchor (null por diseño) —
  // sin esta rama la query quedaba deshabilitada y el chip "acumulado"
  // JAMÁS aparecía tras decidir desde el wrapped (reporte del owner).
  // El inicio del ciclo dinámico es la ventana de accounting (sigue el
  // ciclo elegido), cuyo start == period_end del cierre anterior.
  const acumulado = useCurrentCycleAcumulado(
    familyId,
    dashboard.incomeMode === 'dynamic'
      ? formatLocalDateKey(dashboard.monthlyAccounting.start)
      : (dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null),
  )

  const today = dashboard.todayDate
  // Stabilise the `?? []` fallbacks so downstream memos don't bust
  // when the underlying query data is unchanged.
  const fixedExpensesData = dashboard.fixedExpensesQuery.data
  const fixedExpenses = useMemo(() => fixedExpensesData ?? [], [fixedExpensesData])
  const expensesData = dashboard.expensesQuery.data
  const expenses = useMemo(() => expensesData ?? [], [expensesData])
  // Payments del cycle salarial — la tabla `fixed_expense_payments` se
  // indexa por período del cobro (period_month). La clasificación
  // paid/pending/overdue contra el mes (`monthlyAccounting`) se hace
  // adentro de `summarizeFijos`.
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds: fixedExpenses.map((f) => f.id),
    cycleStart: realCycle.start,
    cycleEnd: realCycle.end,
  })
  // Ver `HomeMonthSummary.fixedPaymentsReady`: sin los pagos, el reparto
  // pagado/pendiente/vencido es una afirmación falsa, no un dato incompleto.
  const paymentsLoading = paymentsQuery.isLoading
  const dismissedHikes = useDismissedHikes()

  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    for (const c of categoriesQuery.data ?? []) {
      // Display localizado NO destructivo (== name crudo si renombrada).
      m.set(c.id, { id: c.id, name: c.displayName, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  const fijosSummary = useMemo(() => {
    if (fixedExpenses.length === 0) return null
    return summarizeFijos({
      items: fixedExpenses,
      paymentsThisCycle: paymentsQuery.data ?? [],
      commitmentExpenses: expenses,
      categoriesById,
      today,
      monthlyStart: realMonthly.start,
      monthlyEnd: realMonthly.end,
      monthlyDays: realMonthly.days,
    })
  }, [
    fixedExpenses,
    paymentsQuery.data,
    expenses,
    categoriesById,
    today,
    realMonthly.start,
    realMonthly.end,
    realMonthly.days,
  ])

  return useMemo<HomeMetrics>(() => {
    // Plano de accounting: saldo, cupo y proyección viven sobre el mes
    // calendario (para non-monthly) o sobre el cycle (para monthly).
    // El countdown salarial sigue separado (paydayPending / paydayDaysOverdue)
    // y lee `payCycle` abajo.
    const monthStart = dashboard.monthlyAccounting.start
    const monthEnd = dashboard.monthlyAccounting.end
    const cycleEnd = dashboard.payCycle.end
    const msPerDay = 86_400_000
    const cycleTotalDays = Math.max(1, dashboard.monthlyAccounting.days)
    const cycleDay = Math.max(
      1,
      Math.min(cycleTotalDays, dashboard.monthlyAccounting.daysIntoMonth),
    )
    // Disponible del ciclo — cuenta CANÓNICA, compartida 1:1 con el push
    // "Buen día" (cron SQL `cycle_disponible`). La lógica de override /
    // proration / gasto-desde-hoy vive en `family-dashboard-model` (que ya
    // entregó los intermedios `effectiveCycle*` + `totalAvailable`); acá
    // solo se compone el cupo diario ("para gustos") y el saldo del mes
    // ("disponible hoy", que suma los income_events del ciclo). Sin override,
    // los intermedios coinciden con los valores tradicionales.
    // Fijos PENDIENTES de pago del ciclo (prorrateados). El cupo reserva TODOS
    // los fijos; el SALDO real los suma de vuelta (solo resta los pagados).
    const fixedPendingReserved = Math.max(
      0,
      Math.round(dashboard.effectiveCommitmentReserved),
    )
    // Rama del cupo. Se nombra acá porque además del cupo decide si el
    // medidor del hero puede restarle el gasto de hoy: en esta rama el cupo
    // ya lo restó (sale de `totalAvailable`) y volver a hacerlo descuenta dos
    // veces el mismo gasto. Ver `derive-gauge-state` y `add-expense-impact`.
    const hasCycleOverride =
      dashboard.cycleStartingBalanceOverride !== null ||
      dashboard.incomeMode === 'dynamic'
    const disponible = computeCycleDisponible({
      effectiveCycleIncome: dashboard.effectiveCycleIncome,
      effectiveCycleDays: dashboard.effectiveCycleDays,
      commitmentPressure: dashboard.fixedExpensesMonthlyTotal,
      effectiveSavingsGoal: dashboard.savingsGoal,
      totalAvailable: dashboard.totalAvailable,
      cycleExtraIncome,
      effectiveReservedFixed: fixedPendingReserved,
      // Modo dinámico: el cupo reparte lo disponible (ingresos del ciclo
      // − gasto − fijos − ahorro) sobre los días RESTANTES — mismo path
      // que el override (espejado en SQL cycle_disponible, flag `dyn`).
      hasCycleOverride,
    })
    // Saldo del mes = plata REAL (computeCycleDisponible lo compone: discrecional
    // + fijos pendientes); el CUPO (dailyBudget) reserva los fijos → no cambia.
    const availableToday = disponible.availableToday
    const dailyBudget = disponible.dailyBudget

    const avgDailySpend = dashboard.variableSpentInCurrentCycle / Math.max(1, cycleDay)
    const projectedTotalSpend = avgDailySpend * cycleTotalDays
    const projectedClose = Math.round(
      dashboard.effectiveCycleIncome
        + cycleExtraIncome
        - dashboard.fixedExpensesMonthlyTotal
        - projectedTotalSpend,
    )

    // Días de atraso del cobro, medidos contra el fin NOMINAL del ciclo.
    //
    // Antes se medían contra `cycleEnd` porque en el modelo NOMINAL la
    // ventana se congela en el payday, así que `cycleEnd` ERA el payday sin
    // confirmar. En el modelo EXTENDIDO eso dejó de ser cierto: la ventana
    // se estira hasta hoy+1, así que `today − cycleEnd` da −1 → clamp 0 →
    // la Home decía "Cobra hoy" el día 13 mientras el resto de la app
    // contaba 8 días de atraso (QA del owner 2026-08-13). `nominalEnd` es
    // el payday configurado en los dos modelos, así que la cuenta vale
    // para ambos. 0 = el payday es literalmente hoy.
    const paydayReference = dashboard.payCycle.nominalEnd ?? cycleEnd
    const paydayDaysOverdue = dashboard.isSalaryPendingConfirmation
      ? Math.max(
          0,
          Math.round((today.getTime() - paydayReference.getTime()) / msPerDay),
        )
      : 0

    // Projection reliability: with <4 elapsed days, a single high-spend
    // outlier blows the linear projection up and shows the user wildly
    // wrong "vas a cerrar con" numbers. Wait until day 4+ before
    // surfacing the projection (UI shows a placeholder until then).
    const projectionReliable = cycleDay >= 4
    // En dinámico el ingreso "configurado" es el modo mismo: las
    // superficies downstream (chip de ahorro, USD, a11y) no se apagan.
    const incomeConfigured =
      dashboard.monthlyIncome > 0 || dashboard.incomeMode === 'dynamic'
    // PostgREST devuelve numeric como string → Number() defensivo.
    // `normalizeFinancePayload` ya lo coerciona, pero aquí lo dejamos
    // explícito por si llega data desde otro camino (fallback / cache
    // optimista) sin pasar por el normalize.
    const monthlyReserveAmount = Math.max(
      0,
      Number(dashboard.familyFinanceQuery.data?.monthly_reserve_amount ?? 0) || 0,
    )
    // Diff balance vs sueldo cuando hay override. Permite al hero
    // diferenciar entre "ajustaste hacia abajo" (peach) y "sumaste
    // plata" (indigo) — sin esto el chip leía "Ajustado para este
    // mes" incluso después de sumar reserva al ciclo, lo cual
    // confundía al user.
    const cycleBalanceDiff =
      dashboard.cycleStartingBalanceOverride !== null
        ? (dashboard.cycleStartingBalanceOverride as number) - dashboard.monthlyIncome
        : 0

    const hero: HomeHeroMetrics = {
      availableToday,
      rawCycleBalance: disponible.rawCycleBalance,
      cycleDay,
      cycleTotalDays,
      cycleMonth: formatCycleLabel(monthStart, monthEnd),
      dailyBudget,
      /** `true` = el cupo ya descontó el gasto de hoy (rama override/dinámico). */
      cupoNetsSpend: hasCycleOverride,
      spentToday: dashboard.variableSpentToday,
      /** Discrecional SIN clampear: sin él la apertura se inventa. */
      discretionaryRaw: disponible.discretionaryRaw,
      openingDailyBudget: computeOpeningDailyBudget({
        dailyBudget,
        spentToday: dashboard.variableSpentToday,
        cupoNetsSpend: hasCycleOverride,
        budgetDays: dashboard.effectiveCycleDays,
        discretionaryRaw: disponible.discretionaryRaw,
      }),
      projectedClose,
      cycleAdjusted: dashboard.cycleStartingBalanceOverride !== null,
      paydayPending: dashboard.isSalaryPendingConfirmation,
      paydayDaysOverdue,
      projectionReliable,
      incomeConfigured,
      incomeMode: dashboard.incomeMode,
      hasCycleIncome: cycleExtraIncome > 0,
      cycleIncomeHydrating:
        dashboard.incomeMode === 'dynamic' && cycleIncomeQuery.isLoading,
      // `true` mientras CUALQUIER insumo de rawCycleBalance está en su primera
      // carga. La pieza que casi siempre llega última es cycleIncomeQuery:
      // home_snapshot siembra finance+gastos+fijos atómicamente pero NUNCA
      // siembra income-events-cycle-sum, así que el primer paint calcula el
      // saldo con gasto real y cero income extra → puede dar negativo y
      // pintar el hero rojo por ~300ms (flash reportado por el owner
      // 2026-08-13). Además la key de esa query incluye la ventana del ciclo
      // derivada de finance: cuando finance resuelve y corre la ventana, la
      // entrada nueva nace vacía y el flash se repetiría — isLoading también
      // cubre esa re-hidratación. isLoading y NO isPending (queda true para
      // siempre en queries deshabilitadas, ver fixedPaymentsReady arriba) ni
      // isFetching (apagaría el estado en cada refetch de background).
      // isError también gatea: una suma de income que FALLÓ no es un dato
      // asentado — sin esto, el fallback `?? 0` del extra income podía pintar
      // un rojo indebido con datos incompletos (en queries deshabilitadas
      // isError es false, no reintroduce la trampa de isPending).
      balanceHydrating:
        dashboard.isLoadingDashboard || cycleIncomeQuery.isLoading || cycleIncomeQuery.isError,
      monthlyIncome: dashboard.monthlyIncome,
      acumulado,
      monthlyReserveAmount,
      cycleBalanceDiff,
      fixedPendingReserved,
    }

    const variableTotal = Math.round(dashboard.variableSpentInCurrentCycle)
    // Conteo de variables del mes (mismo plano que `variableTotal` y el
    // resto del bucket de gasto del mes).
    const variableCount = expenses.filter(
      (e) =>
        !e.commitment_id &&
        new Date(e.created_at) >= monthStart &&
        new Date(e.created_at) < monthEnd,
    ).length
    const trendPct = comparisonQuery.data?.deltaPercent ?? null
    const variableTrend = trendPct == null ? null : trendPct / 100

    const fixedTotal = Math.round(dashboard.fixedExpensesMonthlyTotal)
    const fixedPaid = fijosSummary?.paidItems.length ?? 0
    const fixedCount =
      (fijosSummary?.paidItems.length ?? 0) +
      (fijosSummary?.pendingItems.length ?? 0) +
      (fijosSummary?.overdueItems.length ?? 0)

    const monthSummary: HomeMonthSummary = {
      variableTotal,
      variableCount,
      variableTrend,
      fixedTotal,
      fixedPaid,
      fixedCount,
      fixedOverdue: fijosSummary?.overdueItems.length ?? 0,
      fixedPaymentsReady: !paymentsLoading,
    }

    // Hide hikes the user already acknowledged at the current price
    // — same dismiss store used by the Fijos smart alerts rail. If
    // the price changes later, the stored key no longer matches and
    // the alert reappears automatically.
    const visibleHikes = (fijosSummary?.hikes ?? []).filter(
      (h) => !isHikeDismissed(h.fixedExpenseId, h.currentPrice, dismissedHikes),
    )

    const alerts = buildAlerts({
      upcoming: fijosSummary?.upcoming ?? [],
      zombies: fijosSummary?.zombies ?? [],
      hikes: visibleHikes,
    })

    const goal = buildGoal({
      raw: savingsGoalQuery.data,
      cycleDay,
      cycleTotalDays,
    })

    return { hero, alerts, monthSummary, goal }
  }, [
    today,
    dashboard.payCycle,
    dashboard.monthlyAccounting,
    dashboard.totalAvailable,
    dashboard.variableSpentInCurrentCycle,
    // Sin esto el hero NO se recalcula al cargar un gasto de hoy: el ticket y
    // el medidor quedarían con el número del render anterior — exactamente el
    // síntoma que se está arreglando.
    dashboard.variableSpentToday,
    dashboard.effectiveCycleIncome,
    dashboard.effectiveCycleDays,
    dashboard.monthlyIncome,
    dashboard.savingsGoal,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.effectiveCommitmentReserved,
    dashboard.cycleStartingBalanceOverride,
    dashboard.isSalaryPendingConfirmation,
    dashboard.incomeMode,
    dashboard.familyFinanceQuery.data?.monthly_reserve_amount,
    dashboard.isLoadingDashboard,
    cycleExtraIncome,
    cycleIncomeQuery.isLoading,
    // Sin esta dep, la transición error→success con resultado 0 no mueve
    // ninguna otra (extra 0→0, isLoading false→false) y el memo devolvería
    // un balanceHydrating:true rancio que ocultaría un 'over' legítimo.
    cycleIncomeQuery.isError,
    expenses,
    comparisonQuery.data,
    fijosSummary,
    paymentsLoading,
    savingsGoalQuery.data,
    dismissedHikes,
    acumulado,
  ])
}

function buildAlerts(input: {
  upcoming: FijoItem[]
  zombies: FijoItem[]
  hikes: FijoHikeAlert[]
}): HomeAlert[] {
  const alerts: HomeAlert[] = []

  // 1) Próximo fijo a vencer (el más urgente, diffDays ≤ 3).
  const next = input.upcoming[0]
  if (next && next.daysUntilDue <= 3) {
    const days = next.daysUntilDue
    const when =
      days === 0
        ? i18n.t('home:alerts.dueWhen.today')
        : days === 1
          ? i18n.t('home:alerts.dueWhen.tomorrow')
          : i18n.t('home:alerts.dueWhen.inDays', { days })
    alerts.push({
      id: `upcoming-${next.id}`,
      type: 'upcoming_fixed',
      title: i18n.t('home:alerts.upcomingTitle', { name: next.name, when }),
      subtitle: `$${Math.round(Number(next.amount ?? 0)).toLocaleString(getIntlLocale())}`,
      actionLabel: i18n.t('home:alerts.markPaid'),
      actionRoute: `/(app)/(tabs)/fixed-expenses`,
      urgency: days <= 1 ? 'high' : 'medium',
    })
  }

  // 2) Suscripciones zombi agrupadas en un solo chip.
  if (input.zombies.length > 0) {
    const n = input.zombies.length
    alerts.push({
      id: 'zombies',
      type: 'zombie_subscription',
      title: i18n.t('home:alerts.zombieTitle', { count: n }),
      subtitle: i18n.t('home:alerts.zombieSubtitle'),
      actionLabel: i18n.t('home:alerts.review'),
      actionRoute: '/(app)/(tabs)/fixed-expenses',
      urgency: 'medium',
    })
  }

  // 3) Aumento más grande detectado (top 1 de hikes ≥ 10%).
  const topHike = input.hikes.find((h) => h.deltaPct >= 10)
  if (topHike) {
    alerts.push({
      id: `hike-${topHike.fixedExpenseId}`,
      type: 'price_hike',
      title: i18n.t('home:alerts.hikeTitle', {
        name: topHike.name,
        pct: topHike.deltaPct,
      }),
      subtitle: i18n.t('home:alerts.hikeSubtitle'),
      actionLabel: i18n.t('home:alerts.view'),
      actionRoute: '/(app)/(tabs)/fixed-expenses',
      urgency: 'low',
    })
  }

  // Orden final: high → medium → low.
  const weight: Record<HomeAlertUrgency, number> = { high: 0, medium: 1, low: 2 }
  alerts.sort((a, b) => weight[a.urgency] - weight[b.urgency])
  return alerts
}

function buildGoal(input: {
  raw:
    | {
        id: string
        title: string
        emoji: string
        goalAmount: number
        currentAmount: number
        targetMonths: number | null
      }
    | null
    | undefined
  cycleDay: number
  cycleTotalDays: number
}): HomeGoalMetrics | null {
  const { raw, cycleDay, cycleTotalDays } = input
  if (!raw) return null

  const current = Number(raw.currentAmount ?? 0)
  const target = Number(raw.goalAmount ?? 0)
  const missing = Math.max(0, target - current)

  // Fallback: sin log de contribuciones todavía, tomamos el ritmo
  // implícito del plan original (target_months) como aproximación.
  // Cuando agreguemos savings_contributions, `contributionThisMonth`
  // saldrá del SUM de deltas del ciclo actual.
  const planMonths = raw.targetMonths && raw.targetMonths > 0 ? raw.targetMonths : 0
  const planPace = planMonths > 0 ? target / planMonths : missing
  const contributionThisMonth = 0
  const projectedMonthContribution =
    contributionThisMonth > 0 && cycleDay > 0
      ? Math.round((contributionThisMonth / cycleDay) * cycleTotalDays)
      : planPace

  const originalMonthsRemaining =
    planPace > 0 ? Math.max(1, missing / planPace) : planMonths
  const projectedMonthsRemaining =
    projectedMonthContribution > 0
      ? Math.max(1, missing / projectedMonthContribution)
      : originalMonthsRemaining

  return {
    id: raw.id,
    name: raw.title,
    emoji: raw.emoji,
    current,
    target,
    contributionThisMonth,
    projectedMonthContribution: Math.round(projectedMonthContribution),
    originalMonthsRemaining,
    projectedMonthsRemaining,
  }
}
