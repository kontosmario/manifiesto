import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  formatRemainingDays,
  type CommitmentSummary,
  type ControlHeroState,
} from '@/features/insights/control-types'
import { isFiniteNumber } from '@/features/insights/signal-guards'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

/**
 * Días restantes saneados: si el valor no es finito, `formatRemainingDays`
 * renderizaría "NaN dias". Colapsamos a 0 → "Hoy", un texto válido y seguro.
 * Mantiene el invariante "dato válido o ausente, nunca errático".
 */
function safeRemainingDays(days: number): string {
  return formatRemainingDays(isFiniteNumber(days) ? days : 0)
}

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
        remaining: safeRemainingDays(remainingUntilPayday),
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
        // Guard: monto reservado no finito → "∞"/"NaN" en el detalle; lo
        // colapsamos a 0 (texto de moneda válido) sin perder el hero.
        amount: currencyFormatter.format(
          isFiniteNumber(commitmentSummary.reservedTotal) ? commitmentSummary.reservedTotal : 0,
        ),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.overdue.eyebrow'),
      title: i18n.t('insights:controlActions.hero.overdue.title'),
      variant: 'accent',
    }
  }

  // Guard: `Infinity > 0` es true; sin exigir finito el hero mostraría
  // "Recortá ∞ por día". Si el ajuste no es finito, salteamos este hero y
  // caemos a uno válido más abajo (dato ausente, nunca errático).
  if (
    isFiniteNumber(expenseAnalytics?.adjustmentNeededPerDay) &&
    expenseAnalytics.adjustmentNeededPerDay > 0
  ) {
    return {
      detail: i18n.t('insights:controlActions.hero.adjustDaily.detail', {
        amount: currencyFormatter.format(expenseAnalytics.adjustmentNeededPerDay),
      }),
      eyebrow: i18n.t('insights:controlActions.hero.adjustDaily.eyebrow'),
      title: i18n.t('insights:controlActions.hero.adjustDaily.title'),
      variant: 'accent',
    }
  }

  // Guard: exigimos `reservedTotal` finito en el gate (Infinity pasaría > 0 y
  // formatearía "∞"); con monto inválido salteamos a un hero seguro.
  if (
    commitmentSummary.dueSoonCount > 0 &&
    isFiniteNumber(commitmentSummary.reservedTotal) &&
    commitmentSummary.reservedTotal > 0
  ) {
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
      remaining: safeRemainingDays(remainingUntilPayday),
    }),
    eyebrow: i18n.t('insights:controlActions.hero.steady.eyebrow'),
    title: i18n.t('insights:controlActions.hero.steady.title'),
    variant: 'hero',
  }
}
