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
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import {
  isHikeDismissed,
  useDismissedHikes,
} from '@/features/fijos/use-hike-dismiss-store'

const MONTH_SHORT_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function formatCycleLabel(start: Date, end: Date): string {
  const s = `${start.getDate()} ${MONTH_SHORT_ES[start.getMonth()]}`
  const e = `${end.getDate()} ${MONTH_SHORT_ES[end.getMonth()]}`
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
  cycleDay: number
  cycleTotalDays: number
  cycleMonth: string
  dailyBudget: number
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
   * `true` when the family has set a monthly income (>0). When false
   * the entire downstream math collapses to zero and the hero shows
   * a setup CTA instead of "$0 disponible".
   */
  incomeConfigured: boolean
}

export interface HomeMonthSummary {
  variableTotal: number
  variableCount: number
  /** Delta en fracción — 0.12 = +12%. `null` cuando no hay base comparativa. */
  variableTrend: number | null
  fixedTotal: number
  fixedPaid: number
  fixedCount: number
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
    cycleStart: dashboard.payCycle.start,
    cycleEnd: dashboard.payCycle.end,
  })
  const dismissedHikes = useDismissedHikes()

  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { id: c.id, name: c.name, color: c.color })
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
      monthlyStart: dashboard.monthlyAccounting.start,
      monthlyEnd: dashboard.monthlyAccounting.end,
      monthlyDays: dashboard.monthlyAccounting.days,
    })
  }, [
    fixedExpenses,
    paymentsQuery.data,
    expenses,
    categoriesById,
    today,
    dashboard.monthlyAccounting.start,
    dashboard.monthlyAccounting.end,
    dashboard.monthlyAccounting.days,
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
    // "Disponible hoy" = plata discrecional restante del ciclo
    // (dashboard.totalAvailable ya excluye fijos y ahorro). Le sumamos
    // los `income_events` del ciclo (transferencias, bonos, regalos)
    // para que el saldo positivo extra impacte de inmediato.
    const availableToday = Math.max(
      0,
      Math.round(dashboard.totalAvailable + cycleExtraIncome),
    )
    // Cupo diario BASE — misma definición que Control adapter y
    // Daily Budget Engine:
    //   libreMes = ingresoEfectivo − fijos − ahorro destinado del mes
    //   cupoDiario = libreMes / cycleDays
    // Cuando el usuario ajustó su disponible del ciclo, el dashboard
    // ya entrega `effectiveCycleIncome` (override prorrateado) y
    // `effectiveCycleDays` (= días que quedan del ciclo). Sin override,
    // ambos coinciden con los valores tradicionales y el cupo canónico
    // queda intacto.
    const libreMes = Math.max(
      0,
      Math.round(
        dashboard.effectiveCycleIncome -
          dashboard.fixedExpensesMonthlyTotal -
          dashboard.savingsGoal,
      ),
    )
    const dailyBudget = Math.max(0, Math.round(libreMes / Math.max(1, dashboard.effectiveCycleDays)))

    const avgDailySpend = dashboard.variableSpentInCurrentCycle / Math.max(1, cycleDay)
    const projectedTotalSpend = avgDailySpend * cycleTotalDays
    const projectedClose = Math.round(
      dashboard.effectiveCycleIncome
        + cycleExtraIncome
        - dashboard.fixedExpensesMonthlyTotal
        - projectedTotalSpend,
    )

    // When `isSalaryPendingConfirmation` is true the cycle is frozen
    // on the previous payday — `cycleEnd` equals the (unconfirmed)
    // upcoming payday, so the gap between today and `cycleEnd` is
    // exactly the days overdue. 0 = payday is literally today.
    const paydayDaysOverdue = dashboard.isSalaryPendingConfirmation
      ? Math.max(
          0,
          Math.round((today.getTime() - cycleEnd.getTime()) / msPerDay),
        )
      : 0

    // Projection reliability: with <4 elapsed days, a single high-spend
    // outlier blows the linear projection up and shows the user wildly
    // wrong "vas a cerrar con" numbers. Wait until day 4+ before
    // surfacing the projection (UI shows a placeholder until then).
    const projectionReliable = cycleDay >= 4
    const incomeConfigured = dashboard.monthlyIncome > 0

    const hero: HomeHeroMetrics = {
      availableToday,
      cycleDay,
      cycleTotalDays,
      cycleMonth: formatCycleLabel(monthStart, monthEnd),
      dailyBudget,
      projectedClose,
      cycleAdjusted: dashboard.cycleStartingBalanceOverride !== null,
      paydayPending: dashboard.isSalaryPendingConfirmation,
      paydayDaysOverdue,
      projectionReliable,
      incomeConfigured,
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
    dashboard.effectiveCycleIncome,
    dashboard.effectiveCycleDays,
    dashboard.monthlyIncome,
    dashboard.savingsGoal,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.cycleStartingBalanceOverride,
    dashboard.isSalaryPendingConfirmation,
    cycleExtraIncome,
    expenses,
    comparisonQuery.data,
    fijosSummary,
    savingsGoalQuery.data,
    dismissedHikes,
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
    const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days}d`
    alerts.push({
      id: `upcoming-${next.id}`,
      type: 'upcoming_fixed',
      title: `${next.name} vence ${when}`,
      subtitle: `$${Math.round(Number(next.amount ?? 0)).toLocaleString('es-AR')}`,
      actionLabel: 'Marcar pagado',
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
      title: `${n} ${n === 1 ? 'suscripción zombi' : 'suscripciones zombi'}`,
      subtitle: 'sin uso hace más de 45 días',
      actionLabel: 'Revisar',
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
      title: `${topHike.name} subió +${topHike.deltaPct}%`,
      subtitle: 'vs mes pasado',
      actionLabel: 'Ver',
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
