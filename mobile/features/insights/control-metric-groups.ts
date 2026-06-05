import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { formatRemainingDays, type CommitmentSummary, type MetricDescriptor } from '@/features/insights/control-model'
import { currencyFormatter, formatSignedCurrency } from '@/utils/money'

export function buildHeroMetrics({
  commitmentSummary,
  dailyBudgetSummary,
  flexibleDelta,
  flexibleTargetAmount,
  hasDailyBudgetBase,
  remainingUntilPayday,
  savingsGoalPercent,
  targetFlexiblePercent,
  variableSpentInCurrentCycle,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  flexibleDelta: number
  flexibleTargetAmount: number
  hasDailyBudgetBase: boolean
  remainingUntilPayday: number
  savingsGoalPercent: number
  targetFlexiblePercent: number
  variableSpentInCurrentCycle: number
}): MetricDescriptor[] {
  if (!hasDailyBudgetBase) {
    return []
  }

  const todayTone: MetricDescriptor['tone'] =
    dailyBudgetSummary.remainingToday < 0
      ? 'warning'
      : dailyBudgetSummary.status === 'positive'
        ? 'success'
        : 'default'
  const thirdMetric: MetricDescriptor =
    commitmentSummary.reservedTotal > 0
      ? {
          helper: `${commitmentSummary.dueSoonCount} cerca · ${commitmentSummary.overdueCount} vencidos`,
          icon: 'schedule',
          label: 'Pendiente fijo',
          tone:
            commitmentSummary.overdueCount > 0 || commitmentSummary.dueSoonCount > 0
              ? 'warning'
              : 'default',
          value: currencyFormatter.format(commitmentSummary.reservedTotal),
        }
      : {
          helper: `Mix 50/${targetFlexiblePercent}/${savingsGoalPercent} · ${currencyFormatter.format(
            variableSpentInCurrentCycle,
          )} de ${currencyFormatter.format(flexibleTargetAmount)}.`,
          icon: flexibleDelta > 0 ? 'bolt' : 'insights',
          label: 'Desvio flexible',
          tone: flexibleDelta > 0 ? 'warning' : flexibleTargetAmount > 0 ? 'success' : 'default',
          value: formatSignedCurrency(flexibleDelta),
        }

  return [
    {
      helper: `Gastado hoy ${currencyFormatter.format(dailyBudgetSummary.todaySpent)}`,
      icon: 'account-balance-wallet',
      label: 'Disponible hoy',
      tone: todayTone,
      value: currencyFormatter.format(dailyBudgetSummary.remainingToday),
    },
    {
      helper: `Dia ${dailyBudgetSummary.cycleDayIndex} de ${dailyBudgetSummary.daysInCycle}`,
      icon: 'calendar-month',
      label: 'Hasta cobro',
      tone: 'default',
      value: formatRemainingDays(remainingUntilPayday),
    },
    thirdMetric,
  ]
}

export function buildTodayMetrics({
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
}: {
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
}): MetricDescriptor[] {
  if (!hasDailyBudgetBase) {
    return []
  }

  const carryoverTone: MetricDescriptor['tone'] =
    dailyBudgetSummary.carryoverAmount >= 0 ? 'success' : 'warning'
  const reserveValue =
    dailyBudgetSummary.bufferReserve > 0
      ? currencyFormatter.format(dailyBudgetSummary.bufferRemaining)
      : currencyFormatter.format(
          expenseAnalytics?.recommendedDailyCap ?? dailyBudgetSummary.baseDailyBudget,
        )

  return [
    {
      helper: `Apertura del dia ${currencyFormatter.format(dailyBudgetSummary.openingBudget)}`,
      icon: 'receipt-long',
      label: 'Gastado hoy',
      tone:
        dailyBudgetSummary.todaySpent > dailyBudgetSummary.openingBudget
          ? 'warning'
          : 'default',
      value: currencyFormatter.format(dailyBudgetSummary.todaySpent),
    },
    {
      helper: 'Comparado con el ritmo ideal del mes.',
      icon: dailyBudgetSummary.carryoverAmount >= 0 ? 'insights' : 'bolt',
      label: dailyBudgetSummary.carryoverAmount >= 0 ? 'Aire acumulado' : 'Deuda diaria',
      tone: carryoverTone,
      value: currencyFormatter.format(Math.abs(dailyBudgetSummary.carryoverAmount)),
    },
    {
      helper:
        dailyBudgetSummary.bufferReserve > 0
          ? 'Reserva separada para absorber desvios.'
          : 'Cap simple para sostener el cierre.',
      icon: dailyBudgetSummary.bufferReserve > 0 ? 'lock' : 'speed',
      label: dailyBudgetSummary.bufferReserve > 0 ? 'Colchon restante' : 'Tope sugerido',
      tone:
        dailyBudgetSummary.bufferReserve > 0 && dailyBudgetSummary.bufferRemaining === 0
          ? 'warning'
          : 'default',
      value: reserveValue,
    },
    {
      helper:
        dailyBudgetSummary.zeroSpendStreak > 0
          ? `${dailyBudgetSummary.zeroSpendDaysInCycle} dias sin gasto en este mes.`
          : `Si no gastas mas, manana abres con ${currencyFormatter.format(
              dailyBudgetSummary.projectedTomorrowOpening,
            )}.`,
      icon: dailyBudgetSummary.zeroSpendStreak > 0 ? 'event-available' : 'calendar-month',
      label: dailyBudgetSummary.zeroSpendStreak > 0 ? 'Racha' : 'Manana abre',
      tone: dailyBudgetSummary.zeroSpendStreak > 0 ? 'success' : 'default',
      value:
        dailyBudgetSummary.zeroSpendStreak > 0
          ? `${dailyBudgetSummary.zeroSpendStreak} en fila`
          : currencyFormatter.format(dailyBudgetSummary.projectedTomorrowOpening),
    },
  ]
}
