import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  type CommitmentSummary,
  type ControlMood,
  type MetricDescriptor,
} from '@/features/insights/control-types'
import { currencyFormatter } from '@/utils/money'

export function buildFocusMetrics({
  commitmentSummary,
  expenseAnalytics,
}: {
  commitmentSummary: CommitmentSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
}): MetricDescriptor[] {
  const metrics: MetricDescriptor[] = []

  if (expenseAnalytics?.topCategory) {
    metrics.push({
      helper: `${expenseAnalytics.topCategory.label} suma ${currencyFormatter.format(
        expenseAnalytics.topCategory.total,
      )} en el ciclo.`,
      icon: 'category',
      label: 'Categoria que mas pesa',
      tone: expenseAnalytics.topCategory.share >= 0.35 ? 'warning' : 'default',
      value: `${Math.round(expenseAnalytics.topCategory.share * 100)}%`,
      wide: true,
    })
  }

  if (expenseAnalytics?.recurringFocus) {
    metrics.push({
      helper: `${expenseAnalytics.recurringFocus.label} se repitio ${expenseAnalytics.recurringFocus.count} veces.`,
      icon: 'repeat',
      label: 'Gasto repetido',
      tone: 'warning',
      value: currencyFormatter.format(expenseAnalytics.recurringFocus.total),
    })
  }

  if (
    expenseAnalytics?.weekendPremiumRatio != null &&
    expenseAnalytics.weekendPremiumRatio >= 1.05
  ) {
    metrics.push({
      helper: 'Compara sabados y domingos contra el promedio de lunes a viernes.',
      icon: 'weekend',
      label: 'Fin de semana',
      tone: expenseAnalytics.weekendPremiumRatio >= 1.25 ? 'warning' : 'default',
      value: `+${Math.round((expenseAnalytics.weekendPremiumRatio - 1) * 100)}%`,
    })
  }

  if (commitmentSummary.reservedTotal > 0) {
    metrics.push({
      helper: `${commitmentSummary.dueSoonCount} cerca · ${commitmentSummary.overdueCount} vencidos`,
      icon: 'account-balance',
      label: 'Compromisos del ciclo',
      tone:
        commitmentSummary.overdueCount > 0 || commitmentSummary.dueSoonCount > 0
          ? 'warning'
          : 'default',
      value: currencyFormatter.format(commitmentSummary.reservedTotal),
    })
  }

  if (commitmentSummary.debtBalanceTotal > 0) {
    metrics.push({
      helper: 'Saldo vivo cargado en deudas del hogar.',
      icon: 'lock',
      label: 'Deuda total',
      tone: 'warning',
      value: currencyFormatter.format(commitmentSummary.debtBalanceTotal),
    })
  }

  if (metrics.length === 0 && expenseAnalytics) {
    metrics.push({
      helper: 'No aparece ninguna concentracion fuerte ni aceleracion relevante.',
      icon: 'insights',
      label: 'Ritmo general',
      tone: expenseAnalytics.projectedAvailableAtCycleEnd >= 0 ? 'success' : 'default',
      value:
        expenseAnalytics.projectedAvailableAtCycleEnd >= 0 ? 'Estable' : 'A seguir de cerca',
      wide: true,
    })
  }

  return metrics.slice(0, 4)
}

export function buildControlMood({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
}): ControlMood {
  if (!hasDailyBudgetBase) {
    return {
      detail: 'Falta configurar la base financiera.',
      label: 'Sin base',
      score: 0,
      tone: 'warning',
    }
  }

  let score = 86

  if (isSalaryPendingConfirmation) {
    score -= 18
  }

  if (dailyBudgetSummary.status === 'critical') {
    score -= 10
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    score -= 22
  }

  score -= Math.min(commitmentSummary.overdueCount * 12, 28)
  score -= Math.min(commitmentSummary.dueSoonCount * 4, 12)

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    const capBase = Math.max(expenseAnalytics.recommendedDailyCap, 1)
    score -= Math.min(20, (expenseAnalytics.adjustmentNeededPerDay / capBase) * 18)
  }

  if (expenseAnalytics?.weeklyDeltaRatio && expenseAnalytics.weeklyDeltaRatio > 0) {
    score -= Math.min(12, expenseAnalytics.weeklyDeltaRatio * 40)
  }

  if (expenseAnalytics?.topCategory && expenseAnalytics.topCategory.share >= 0.35) {
    score -= 7
  }

  if (dailyBudgetSummary.zeroSpendStreak >= 2) {
    score += 4
  }

  const safeScore = Math.max(0, Math.min(100, Math.round(score)))

  if (safeScore >= 78) {
    return {
      detail: 'Hay aire para decidir sin apuro.',
      label: 'Solido',
      score: safeScore,
      tone: 'success',
    }
  }

  if (safeScore >= 58) {
    return {
      detail: 'Conviene seguir de cerca el ritmo.',
      label: 'Estable',
      score: safeScore,
      tone: 'default',
    }
  }

  return {
    detail: 'El ciclo ya necesita correcciones concretas.',
    label: 'Tenso',
    score: safeScore,
    tone: 'warning',
  }
}
