import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import type { Expense } from '@/features/expenses/use-expenses'
import type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'
import { formatLocalDateKey, normalizeToStartOfDay } from '@/utils/pay-cycle'

import { DAY_MS } from "@/utils/time"

export type DailyBudgetBufferMode = 'none' | 'fixed' | 'percent'
export type DailyBudgetStatus = 'positive' | 'critical' | 'exceeded'
export type DailyBudgetSuggestionTone = 'primary' | 'success' | 'warning'

export interface DailyBudgetSuggestion {
  detail: string
  title: string
  tone: DailyBudgetSuggestionTone
}

export interface DailyBudgetSummary {
  baseDailyBudget: number
  bufferConsumed: number
  bufferMode: DailyBudgetBufferMode
  bufferRemaining: number
  bufferReserve: number
  carryoverAmount: number
  cycleDayIndex: number
  daysInCycle: number
  openingBudget: number
  operationalCycleBudget: number
  plannedVariableBudget: number
  projectedTomorrowOpening: number
  remainingRatio: number
  remainingToday: number
  spentBeforeToday: number
  spentInCurrentCycle: number
  status: DailyBudgetStatus
  statusLabel: string
  suggestions: DailyBudgetSuggestion[]
  todaySpent: number
  zeroSpendDaysInCycle: number
  zeroSpendStreak: number
}

interface ComputeDailyBudgetSummaryInput {
  bufferMode: DailyBudgetBufferMode
  bufferValue: number
  expenses: Expense[]
  fixedExpensesMonthlyTotal: number
  monthlyIncome: number
  /**
   * Ventana mensual de accounting — sobre este plano se proyecta cupo
   * diario, "in cycle" buckets y proration del override. Para monthly
   * users coincide con el salary cycle; para weekly/biweekly/custom es
   * el mes calendario.
   *
   * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
   */
  monthlyAccounting: MonthlyAccountingWindow
  savingsGoal: number
  today: Date
  /**
   * Per-cycle override (`current_cycle_starting_balance`). When the
   * user has reported their actual available cash for THIS cycle
   * (different from `monthly_income`), pass the amount here. The
   * engine then re-anchors the cycle to today: spending before today
   * is forgotten, and the override is divided across the remaining
   * days, with `fixedExpensesMonthlyTotal` and `savingsGoal` prorated
   * to the same window.
   *
   * Pass `null`/`undefined` to use the standard formula based on
   * `monthlyIncome` across the full pay cycle.
   */
  cycleStartingBalance?: number | null
}

function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.max(min, Math.min(value, max))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return normalizeToStartOfDay(next)
}

function diffDays(start: Date, end: Date) {
  return Math.round(
    (normalizeToStartOfDay(end).getTime() - normalizeToStartOfDay(start).getTime()) / DAY_MS,
  )
}

export function computeDailyBudgetSummary({
  bufferMode,
  bufferValue,
  expenses,
  fixedExpensesMonthlyTotal,
  monthlyIncome,
  monthlyAccounting,
  savingsGoal,
  today,
  cycleStartingBalance,
}: ComputeDailyBudgetSummaryInput): DailyBudgetSummary {
  const safeToday = normalizeToStartOfDay(today)
  const originalCycleStart = normalizeToStartOfDay(monthlyAccounting.start)
  const cycleEnd = normalizeToStartOfDay(monthlyAccounting.end)
  const monthlyDays = Math.max(monthlyAccounting.days, 1)

  // ── Override path ───────────────────────────────────────────────
  // When the user has reported a starting balance for THIS cycle,
  // re-anchor the cycle to today: the override becomes the new
  // starting cash, fixed/savings are prorated to the remaining
  // window, and past spending is excluded from the daily-budget
  // accounting (it happened "before this synthetic cycle").
  const hasOverride =
    typeof cycleStartingBalance === 'number' &&
    Number.isFinite(cycleStartingBalance) &&
    cycleStartingBalance >= 0
  const cycleStart = hasOverride ? safeToday : originalCycleStart
  const remainingDaysFromToday = Math.max(1, diffDays(safeToday, cycleEnd))
  const effectiveCycleDays = hasOverride
    ? remainingDaysFromToday
    : monthlyDays
  // El override es un presupuesto BRUTO del ciclo (no una foto de saldo): hay
  // que restarle el gasto variable PREVIO a hoy (salió de ese presupuesto) y
  // prorratear los fijos SOLO si el override es DOWN (cobré menos que el sueldo
  // recurrente). Antes prorrateaba en CUALQUIER override y olvidaba el gasto
  // previo (re-ancla a hoy con spentBeforeToday=0) → cupo inflado ~54% y nudge
  // tardío. Espeja el modelo canónico (family-dashboard-model / cycle_disponible).
  const overrideIsDown =
    hasOverride && (cycleStartingBalance as number) < monthlyIncome
  const proration = overrideIsDown ? remainingDaysFromToday / monthlyDays : 1
  const priorVariableSpend = hasOverride
    ? expenses.reduce((sum, expense) => {
        const d = normalizeToStartOfDay(new Date(expense.created_at))
        if (Number.isNaN(d.getTime()) || d < originalCycleStart || d >= safeToday) {
          return sum
        }
        return sum + expense.price
      }, 0)
    : 0
  const effectiveMonthlyIncome = hasOverride
    ? Math.max(0, (cycleStartingBalance as number) - priorVariableSpend)
    : monthlyIncome
  const effectiveFixed = hasOverride ? fixedExpensesMonthlyTotal * proration : fixedExpensesMonthlyTotal
  const effectiveSavings = hasOverride ? savingsGoal * proration : savingsGoal

  const plannedVariableBudget = clamp(effectiveMonthlyIncome - effectiveFixed - effectiveSavings)
  const normalizedBufferValue = clamp(bufferValue)
  const bufferReserve =
    bufferMode === 'fixed'
      ? Math.min(normalizedBufferValue, plannedVariableBudget)
      : bufferMode === 'percent'
        ? Math.min(plannedVariableBudget, plannedVariableBudget * (normalizedBufferValue / 100))
        : 0
  const operationalCycleBudget = clamp(plannedVariableBudget - bufferReserve)
  const baseDailyBudget = operationalCycleBudget / effectiveCycleDays
  const cycleDayIndex = clamp(diffDays(cycleStart, safeToday) + 1, 1, effectiveCycleDays)
  const dailyTotals = new Map<string, number>()

  expenses.forEach((expense) => {
    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    const expenseMs = expenseDate.getTime()

    if (
      Number.isNaN(expenseMs) ||
      expenseDate < cycleStart ||
      expenseDate >= cycleEnd
    ) {
      return
    }

    const dayKey = formatLocalDateKey(expenseDate)
    dailyTotals.set(dayKey, (dailyTotals.get(dayKey) ?? 0) + expense.price)
  })

  let spentBeforeToday = 0
  let zeroSpendDaysInCycle = 0

  for (let cursor = cycleStart; cursor < safeToday; cursor = addDays(cursor, 1)) {
    const total = dailyTotals.get(formatLocalDateKey(cursor)) ?? 0
    spentBeforeToday += total
    if (total === 0) {
      zeroSpendDaysInCycle += 1
    }
  }

  const todaySpent = dailyTotals.get(formatLocalDateKey(safeToday)) ?? 0
  if (todaySpent === 0) {
    zeroSpendDaysInCycle += 1
  }

  const spentInCurrentCycle = spentBeforeToday + todaySpent
  const plannedBeforeToday = baseDailyBudget * Math.max(0, cycleDayIndex - 1)
  const openingBudget = baseDailyBudget + (plannedBeforeToday - spentBeforeToday)
  const remainingToday = openingBudget - todaySpent
  const remainingRatio =
    openingBudget > 0 ? clamp(remainingToday / openingBudget, 0, 1) : remainingToday >= 0 ? 1 : 0
  const bufferConsumed = clamp(spentInCurrentCycle - operationalCycleBudget)
  const bufferRemaining = clamp(bufferReserve - bufferConsumed)
  const projectedTomorrowOpening = openingBudget + baseDailyBudget - todaySpent

  let zeroSpendStreak = 0
  for (let cursor = safeToday; cursor >= cycleStart; cursor = addDays(cursor, -1)) {
    const total = dailyTotals.get(formatLocalDateKey(cursor)) ?? 0
    if (total !== 0) {
      break
    }

    zeroSpendStreak += 1

    if (cursor.getTime() === cycleStart.getTime()) {
      break
    }
  }

  const status: DailyBudgetStatus =
    remainingToday < 0 ? 'exceeded' : remainingRatio <= 0.2 ? 'critical' : 'positive'
  const statusLabel =
    status === 'exceeded'
      ? i18n.t('gastos:dailyBudget.status.exceeded')
      : status === 'critical'
        ? i18n.t('gastos:dailyBudget.status.critical')
        : i18n.t('gastos:dailyBudget.status.inRange')

  const suggestions: DailyBudgetSuggestion[] = []

  if (remainingToday < 0) {
    suggestions.push({
      detail: i18n.t('gastos:dailyBudget.ateTomorrow.detail', { amount: formatSignedCurrency(projectedTomorrowOpening) }),
      title: i18n.t('gastos:dailyBudget.ateTomorrow.title'),
      tone: 'warning',
    })
  } else if (todaySpent === 0) {
    suggestions.push({
      detail: i18n.t('gastos:dailyBudget.zeroDay.detail', { amount: formatSignedCurrency(projectedTomorrowOpening) }),
      title: zeroSpendStreak > 0
        ? i18n.t('gastos:dailyBudget.zeroDay.titleStreak', { count: zeroSpendStreak })
        : i18n.t('gastos:dailyBudget.zeroDay.title'),
      tone: 'success',
    })
  } else {
    suggestions.push({
      detail: i18n.t('gastos:dailyBudget.operatingMargin.detail', { amount: formatSignedCurrency(remainingToday) }),
      title: i18n.t('gastos:dailyBudget.operatingMargin.title'),
      tone: status === 'critical' ? 'warning' : 'primary',
    })
  }

  if (Math.abs(carryoverAmount(openingBudget, baseDailyBudget)) >= Math.max(baseDailyBudget * 0.18, 1500)) {
    const carryover = carryoverAmount(openingBudget, baseDailyBudget)
    suggestions.push({
      detail:
        carryover >= 0
          ? i18n.t('gastos:dailyBudget.carryover.detailPositive', { amount: formatSignedCurrency(carryover) })
          : i18n.t('gastos:dailyBudget.carryover.detailNegative', { amount: formatSignedCurrency(Math.abs(carryover)) }),
      title: carryover >= 0
        ? i18n.t('gastos:dailyBudget.carryover.titlePositive')
        : i18n.t('gastos:dailyBudget.carryover.titleNegative'),
      tone: carryover >= 0 ? 'success' : 'warning',
    })
  }

  if (bufferReserve > 0) {
    suggestions.push({
      detail:
        bufferRemaining > 0
          ? i18n.t('gastos:dailyBudget.buffer.detailIntact', { amount: formatSignedCurrency(bufferRemaining) })
          : i18n.t('gastos:dailyBudget.buffer.detailConsumed'),
      title: bufferRemaining > 0
        ? i18n.t('gastos:dailyBudget.buffer.titleIntact')
        : i18n.t('gastos:dailyBudget.buffer.titleConsumed'),
      tone: bufferRemaining > 0 ? 'primary' : 'warning',
    })
  }

  return {
    baseDailyBudget,
    bufferConsumed,
    bufferMode,
    bufferRemaining,
    bufferReserve,
    carryoverAmount: carryoverAmount(openingBudget, baseDailyBudget),
    cycleDayIndex,
    daysInCycle: effectiveCycleDays,
    openingBudget,
    operationalCycleBudget,
    plannedVariableBudget,
    projectedTomorrowOpening,
    remainingRatio,
    remainingToday,
    spentBeforeToday,
    spentInCurrentCycle,
    status,
    statusLabel,
    suggestions: suggestions.slice(0, 3),
    todaySpent,
    zeroSpendDaysInCycle,
    zeroSpendStreak,
  }
}

function carryoverAmount(openingBudget: number, baseDailyBudget: number) {
  return openingBudget - baseDailyBudget
}

function formatSignedCurrency(value: number) {
  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-' : ''
  return `${prefix}$${absoluteValue.toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`
}
