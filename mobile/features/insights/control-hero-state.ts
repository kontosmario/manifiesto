import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  formatRemainingDays,
  type CommitmentSummary,
  type ControlHeroState,
} from '@/features/insights/control-types'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

export function buildHeroState({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
  remainingUntilPayday,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
  remainingUntilPayday: number
}): ControlHeroState {
  if (!hasDailyBudgetBase) {
    return {
      detail: i18n.t('insights:controlActions.hero.noBase.detail'),
      eyebrow: i18n.t('insights:controlActions.hero.noBase.eyebrow'),
      title: i18n.t('insights:controlActions.hero.noBase.title'),
      variant: 'accent',
    }
  }

  if (isSalaryPendingConfirmation) {
    return {
      detail: i18n.t('insights:controlActions.hero.salaryPending.detail'),
      eyebrow: i18n.t('insights:controlActions.hero.salaryPending.eyebrow'),
      title: i18n.t('insights:controlActions.hero.salaryPending.title'),
      variant: 'accent',
    }
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    return {
      detail: i18n.t('insights:controlActions.hero.overToday.detail', {
        remaining: formatRemainingDays(remainingUntilPayday),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.overToday.eyebrow'),
      title: i18n.t('insights:controlActions.hero.overToday.title'),
      variant: 'accent',
    }
  }

  if (commitmentSummary.overdueCount > 0) {
    return {
      detail: i18n.t('insights:controlActions.hero.overdue.detail', {
        count: commitmentSummary.overdueCount,
        amount: currencyFormatter.format(commitmentSummary.reservedTotal),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.overdue.eyebrow'),
      title: i18n.t('insights:controlActions.hero.overdue.title'),
      variant: 'accent',
    }
  }

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    return {
      detail: i18n.t('insights:controlActions.hero.adjustDaily.detail', {
        amount: currencyFormatter.format(expenseAnalytics.adjustmentNeededPerDay),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.adjustDaily.eyebrow'),
      title: i18n.t('insights:controlActions.hero.adjustDaily.title'),
      variant: 'accent',
    }
  }

  if (commitmentSummary.dueSoonCount > 0 && commitmentSummary.reservedTotal > 0) {
    return {
      detail: i18n.t('insights:controlActions.hero.dueSoon.detail', {
        count: commitmentSummary.dueSoonCount,
        amount: currencyFormatter.format(commitmentSummary.reservedTotal),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.dueSoon.eyebrow'),
      title: i18n.t('insights:controlActions.hero.dueSoon.title'),
      variant: 'hero',
    }
  }

  if (dailyBudgetSummary.zeroSpendStreak >= 2) {
    return {
      detail: i18n.t('insights:controlActions.hero.zeroStreak.detail', {
        count: dailyBudgetSummary.zeroSpendStreak,
      }),
      eyebrow: i18n.t('insights:controlActions.hero.zeroStreak.eyebrow'),
      title: i18n.t('insights:controlActions.hero.zeroStreak.title'),
      variant: 'hero',
    }
  }

  return {
    detail: i18n.t('insights:controlActions.hero.steady.detail', {
      remaining: formatRemainingDays(remainingUntilPayday),
    }),
    eyebrow: i18n.t('insights:controlActions.hero.steady.eyebrow'),
    title: i18n.t('insights:controlActions.hero.steady.title'),
    variant: 'hero',
  }
}
