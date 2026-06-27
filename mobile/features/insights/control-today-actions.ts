import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { type CommitmentSummary, type ControlAction } from '@/features/insights/control-types'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

export function buildTodayActions({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  flexibleDelta,
  flexibleTargetAmount,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
  savingsGoal,
  savingsGoalPercent,
  savingsRemaining,
  targetFlexiblePercent,
  variableSpentInCurrentCycle,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  flexibleDelta: number
  flexibleTargetAmount: number
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
  savingsGoal: number
  savingsGoalPercent: number
  savingsRemaining: number
  targetFlexiblePercent: number
  variableSpentInCurrentCycle: number
}): ControlAction[] {
  if (!hasDailyBudgetBase) {
    return [
      {
        detail: i18n.t('insights:controlActions.today.noBase.detail'),
        title: i18n.t('insights:controlActions.today.noBase.title'),
        tone: 'warning',
      },
    ]
  }

  const actions: ControlAction[] = []

  if (isSalaryPendingConfirmation) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.salaryPending.detail'),
      title: i18n.t('insights:controlActions.today.salaryPending.title'),
      tone: 'warning',
    })
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.overToday.detail', {
        opening: currencyFormatter.format(dailyBudgetSummary.projectedTomorrowOpening),
      }),
      title: i18n.t('insights:controlActions.today.overToday.title'),
      tone: 'warning',
    })
  } else {
    actions.push({
      detail: i18n.t('insights:controlActions.today.remainingToday.detail', {
        remaining: currencyFormatter.format(dailyBudgetSummary.remainingToday),
      }),
      title: i18n.t('insights:controlActions.today.remainingToday.title'),
      tone: 'primary',
    })
  }

  if (commitmentSummary.overdueCount > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.overdue.detail', {
        count: commitmentSummary.overdueCount,
      }),
      title: i18n.t('insights:controlActions.today.overdue.title'),
      tone: 'warning',
    })
  } else if (commitmentSummary.dueSoonCount > 0 && commitmentSummary.reservedTotal > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.reserve.detail', {
        amount: currencyFormatter.format(commitmentSummary.reservedTotal),
      }),
      title: i18n.t('insights:controlActions.today.reserve.title'),
      tone: 'primary',
    })
  }

  if (flexibleTargetAmount > 0 && flexibleDelta > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.flexibleOver.detail', {
        flexiblePct: targetFlexiblePercent,
        savingsPct: savingsGoalPercent,
        target: currencyFormatter.format(flexibleTargetAmount),
        spent: currencyFormatter.format(variableSpentInCurrentCycle),
      }),
      title: i18n.t('insights:controlActions.today.flexibleOver.title'),
      tone: 'warning',
    })
  } else if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.adjustDaily.detail', {
        amount: currencyFormatter.format(expenseAnalytics.adjustmentNeededPerDay),
      }),
      title: i18n.t('insights:controlActions.today.adjustDaily.title'),
      tone: 'warning',
    })
  } else if (dailyBudgetSummary.zeroSpendStreak > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.zeroStreak.detail', {
        count: dailyBudgetSummary.zeroSpendStreak,
      }),
      title: i18n.t('insights:controlActions.today.zeroStreak.title'),
      tone: 'success',
    })
  } else if (flexibleTargetAmount > 0 && savingsRemaining > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.onPlan.detail', {
        remaining: currencyFormatter.format(
          Math.max(0, flexibleTargetAmount - variableSpentInCurrentCycle),
        ),
      }),
      title: i18n.t('insights:controlActions.today.onPlan.title'),
      tone: 'success',
    })
  } else if (savingsGoal > 0 && savingsRemaining > 0) {
    actions.push({
      detail: i18n.t('insights:controlActions.today.protectSavings.detail', {
        remaining: currencyFormatter.format(savingsRemaining),
      }),
      title: i18n.t('insights:controlActions.today.protectSavings.title'),
      tone: 'success',
    })
  }

  return actions.slice(0, 3)
}
