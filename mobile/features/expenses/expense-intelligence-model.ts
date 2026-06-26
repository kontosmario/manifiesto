import type {
  ExpenseAnalyticsSuggestion,
  ExpenseAnalyticsSummary,
} from '@/features/expenses/expense-analytics'
import { formatDeltaPercent } from '@/utils/percent'
import i18n from '@/lib/i18n'
import { currencyFormatter } from '@/utils/money'

export interface IntelligenceMetric {
  helper: string
  icon: 'speed' | 'bolt' | 'receipt-long' | 'category' | 'repeat' | 'weekend'
  label: string
  tone: 'default' | 'success' | 'warning'
  value: string
  wide?: boolean
}

export interface ExpenseIntelligenceViewModel {
  focusMetrics: IntelligenceMetric[]
  hasRisk: boolean
  headlineText: string
  leadMetrics: IntelligenceMetric[]
  metricTone: 'success' | 'warning'
  suggestions: ExpenseAnalyticsSuggestion[]
}

export function buildExpenseIntelligenceViewModel(
  analytics: ExpenseAnalyticsSummary,
): ExpenseIntelligenceViewModel {
  const metricTone: 'success' | 'warning' =
    analytics.projectedAvailableAtCycleEnd >= 0 ? 'success' : 'warning'
  const headlineText =
    analytics.projectedAvailableAtCycleEnd >= 0
      ? i18n.t('gastos:intelligence.headline.healthy')
      : i18n.t('gastos:intelligence.headline.short')

  const leadMetrics: IntelligenceMetric[] = [
    {
      helper: i18n.t('gastos:intelligence.dailyCap.helper', { count: analytics.daysRemainingInCycle }),
      icon: 'speed',
      label: i18n.t('gastos:intelligence.dailyCap.label'),
      tone: analytics.adjustmentNeededPerDay > 0 ? 'warning' : 'default',
      value: currencyFormatter.format(analytics.recommendedDailyCap),
    },
    analytics.adjustmentNeededPerDay > 0
      ? {
          helper: i18n.t('gastos:intelligence.cutPerDay.helper'),
          icon: 'bolt',
          label: i18n.t('gastos:intelligence.cutPerDay.label'),
          tone: 'warning',
          value: currencyFormatter.format(analytics.adjustmentNeededPerDay),
        }
      : {
          helper:
            analytics.weeklyDeltaRatio == null
              ? i18n.t('gastos:intelligence.weeklyPace.helperNoBase')
              : analytics.weeklyDeltaRatio > 0
                ? i18n.t('gastos:intelligence.weeklyPace.helperHeavier')
                : i18n.t('gastos:intelligence.weeklyPace.helperLighter'),
          icon: 'speed',
          label: i18n.t('gastos:intelligence.weeklyPace.label'),
          tone:
            analytics.weeklyDeltaRatio == null
              ? 'default'
              : analytics.weeklyDeltaRatio > 0
                ? 'warning'
                : 'success',
          value: formatDeltaPercent(analytics.weeklyDeltaRatio),
        },
    {
      helper: i18n.t('gastos:intelligence.last7.helper'),
      icon: 'receipt-long',
      label: i18n.t('gastos:intelligence.last7.label'),
      tone: 'default',
      value: currencyFormatter.format(analytics.currentWeekTotal),
    },
  ]

  const focusMetrics: IntelligenceMetric[] = []

  if (analytics.topCategory) {
    focusMetrics.push({
      helper: i18n.t('gastos:intelligence.topCategory.helper', {
        label: analytics.topCategory.label,
        total: currencyFormatter.format(analytics.topCategory.total),
      }),
      icon: 'category',
      label: i18n.t('gastos:intelligence.topCategory.label'),
      tone: analytics.topCategory.share >= 0.35 ? 'warning' : 'default',
      value: `${Math.round(analytics.topCategory.share * 100)}%`,
      wide: true,
    })
  }

  if (analytics.recurringFocus) {
    focusMetrics.push({
      helper: i18n.t('gastos:intelligence.recurring.helper', {
        label: analytics.recurringFocus.label,
        count: analytics.recurringFocus.count,
      }),
      icon: 'repeat',
      label: i18n.t('gastos:intelligence.recurring.label'),
      tone: 'warning',
      value: currencyFormatter.format(analytics.recurringFocus.total),
    })
  }

  if (analytics.weekendPremiumRatio != null && analytics.weekendPremiumRatio >= 1.05) {
    focusMetrics.push({
      helper: i18n.t('gastos:intelligence.weekend.helper'),
      icon: 'weekend',
      label: i18n.t('gastos:intelligence.weekend.label'),
      tone: analytics.weekendPremiumRatio >= 1.25 ? 'warning' : 'default',
      value: `+${Math.round((analytics.weekendPremiumRatio - 1) * 100)}%`,
    })
  }

  return {
    focusMetrics,
    hasRisk: analytics.needsAttention,
    headlineText,
    leadMetrics,
    metricTone,
    suggestions: analytics.suggestions.slice(0, 3),
  }
}
