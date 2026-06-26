import type {
  ExpenseAnalyticsCategoryFocus,
  ExpenseAnalyticsRecurringFocus,
  ExpenseAnalyticsSuggestion,
} from '@/features/expenses/expense-analytics.types'
import type { Expense } from '@/features/expenses/use-expenses'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

export function buildExpenseAnalyticsSuggestions({
  adjustmentNeededPerDay,
  daysRemaining,
  expenses,
  projectedAvailableAtCycleEnd,
  recurringFocus,
  topCategory,
  weeklyDeltaRatio,
  weekendPremiumRatio,
}: {
  adjustmentNeededPerDay: number
  daysRemaining: number
  expenses: Expense[]
  projectedAvailableAtCycleEnd: number
  recurringFocus: ExpenseAnalyticsRecurringFocus | null
  topCategory: ExpenseAnalyticsCategoryFocus | null
  weeklyDeltaRatio: number | null
  weekendPremiumRatio: number | null
}): ExpenseAnalyticsSuggestion[] {
  const suggestions: ExpenseAnalyticsSuggestion[] = []

  if (projectedAvailableAtCycleEnd < 0) {
    const overspend = Math.abs(projectedAvailableAtCycleEnd)
    suggestions.push({
      detail: i18n.t('gastos:analytics.overspendRisk.detail', {
        missing: currencyFormatter.format(overspend),
        perDay: currencyFormatter.format(overspend / Math.max(daysRemaining, 1)),
      }),
      title: i18n.t('gastos:analytics.overspendRisk.title'),
      tone: 'warning',
    })
  }

  if (adjustmentNeededPerDay > 0) {
    suggestions.push({
      detail: i18n.t('gastos:analytics.adjustPace.detail', {
        amount: currencyFormatter.format(adjustmentNeededPerDay),
      }),
      title: i18n.t('gastos:analytics.adjustPace.title'),
      tone: 'warning',
    })
  }

  if (topCategory && topCategory.share >= 0.35) {
    suggestions.push({
      detail: i18n.t('gastos:analytics.concentration.detail', {
        category: topCategory.label,
        percent: Math.round(topCategory.share * 100),
      }),
      title: i18n.t('gastos:analytics.concentration.title'),
      tone: 'primary',
    })
  }

  if (recurringFocus && recurringFocus.total > Math.max(averageTicketFloor(expenses), 3000)) {
    suggestions.push({
      detail: i18n.t('gastos:analytics.recurring.detail', {
        label: recurringFocus.label,
        count: recurringFocus.count,
        total: currencyFormatter.format(recurringFocus.total),
      }),
      title: i18n.t('gastos:analytics.recurring.title'),
      tone: 'warning',
    })
  }

  if (weekendPremiumRatio !== null && weekendPremiumRatio >= 1.25) {
    suggestions.push({
      detail: i18n.t('gastos:analytics.weekend.detail', {
        percent: Math.round((weekendPremiumRatio - 1) * 100),
      }),
      title: i18n.t('gastos:analytics.weekend.title'),
      tone: 'primary',
    })
  }

  if (weeklyDeltaRatio !== null && weeklyDeltaRatio >= 0.15) {
    suggestions.push({
      detail: i18n.t('gastos:analytics.weeklyAccel.detail', {
        percent: Math.round(weeklyDeltaRatio * 100),
      }),
      title: i18n.t('gastos:analytics.weeklyAccel.title'),
      tone: 'warning',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      detail:
        projectedAvailableAtCycleEnd >= 0
          ? i18n.t('gastos:analytics.healthy.detail', {
              amount: currencyFormatter.format(projectedAvailableAtCycleEnd),
            })
          : i18n.t('gastos:analytics.noAlerts.detail'),
      title: projectedAvailableAtCycleEnd >= 0
        ? i18n.t('gastos:analytics.healthy.title')
        : i18n.t('gastos:analytics.noAlerts.title'),
      tone: projectedAvailableAtCycleEnd >= 0 ? 'success' : 'primary',
    })
  }

  return suggestions.slice(0, 3)
}

function averageTicketFloor(expenses: Expense[]) {
  if (expenses.length === 0) {
    return 0
  }

  const total = expenses.reduce((sum, expense) => sum + expense.price, 0)
  return total / expenses.length
}
