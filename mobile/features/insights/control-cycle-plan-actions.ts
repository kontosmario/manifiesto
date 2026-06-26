import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { type CommitmentSummary, type ControlAction } from '@/features/insights/control-types'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

export function buildCyclePlanActions({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
}): ControlAction[] {
  if (!hasDailyBudgetBase) {
    return [
      {
        detail: i18n.t('insights:controlActions.cyclePlan.noBase.detail'),
        title: i18n.t('insights:controlActions.cyclePlan.noBase.title'),
        tone: 'warning',
      },
    ]
  }

  const actions: ControlAction[] = []

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.adjustDaily.detail', {
        amount: currencyFormatter.format(expenseAnalytics.adjustmentNeededPerDay),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.adjustDaily.title'),
      tone: 'warning',
    })
  } else if (expenseAnalytics?.recommendedDailyCap && expenseAnalytics.recommendedDailyCap > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.dailyCap.detail', {
        amount: currencyFormatter.format(expenseAnalytics.recommendedDailyCap),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.dailyCap.title'),
      tone: 'primary',
    })
  }

  if (expenseAnalytics?.topCategory && expenseAnalytics.topCategory.share >= 0.25) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.topCategory.detail', {
        category: expenseAnalytics.topCategory.label,
        pct: Math.round(expenseAnalytics.topCategory.share * 100),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.topCategory.title', {
        category: expenseAnalytics.topCategory.label,
      }),
      tone: 'primary',
    })
  }

  if (expenseAnalytics?.recurringFocus) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.recurringFocus.detail', {
        label: expenseAnalytics.recurringFocus.label,
        count: expenseAnalytics.recurringFocus.count,
        total: currencyFormatter.format(expenseAnalytics.recurringFocus.total),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.recurringFocus.title'),
      tone: 'warning',
    })
  }

  if (commitmentSummary.reservedTotal > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.committed.detail', {
        amount: currencyFormatter.format(commitmentSummary.reservedTotal),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.committed.title'),
      tone: commitmentSummary.overdueCount > 0 ? 'warning' : 'primary',
    })
  }

  if (
    expenseAnalytics?.weekendPremiumRatio != null &&
    expenseAnalytics.weekendPremiumRatio >= 1.15
  ) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.weekend.detail', {
        pct: Math.round((expenseAnalytics.weekendPremiumRatio - 1) * 100),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.weekend.title'),
      tone: 'primary',
    })
  }

  if (actions.length === 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.cyclePlan.steady.detail', {
        remaining: currencyFormatter.format(dailyBudgetSummary.remainingToday),
      }),
      title: i18n.t('insights:controlActions.cyclePlan.steady.title'),
      tone: 'success',
    })
  }

  return actions.slice(0, 4)
}
