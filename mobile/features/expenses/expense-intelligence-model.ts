import type {
  ExpenseAnalyticsSuggestion,
  ExpenseAnalyticsSummary,
} from '@/features/expenses/expense-analytics'
import { formatDeltaPercent } from '@/utils/percent'
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
      ? 'Si sigues así, todavía debería quedar aire al final del ciclo.'
      : 'Si sigues así, el ciclo termina corto y conviene corregir ahora.'

  const leadMetrics: IntelligenceMetric[] = [
    {
      helper: `${analytics.daysRemainingInCycle} días restantes en el ciclo.`,
      icon: 'speed',
      label: 'Tope diario',
      tone: analytics.adjustmentNeededPerDay > 0 ? 'warning' : 'default',
      value: currencyFormatter.format(analytics.recommendedDailyCap),
    },
    analytics.adjustmentNeededPerDay > 0
      ? {
          helper: 'Recorte sugerido para llegar al próximo cobro.',
          icon: 'bolt',
          label: 'Baja por día',
          tone: 'warning',
          value: currencyFormatter.format(analytics.adjustmentNeededPerDay),
        }
      : {
          helper:
            analytics.weeklyDeltaRatio == null
              ? 'Todavía no hay suficiente base para comparar semanas.'
              : analytics.weeklyDeltaRatio > 0
                ? 'Esta semana viene más cargada.'
                : 'Esta semana viene más liviana o estable.',
          icon: 'speed',
          label: 'Ritmo semanal',
          tone:
            analytics.weeklyDeltaRatio == null
              ? 'default'
              : analytics.weeklyDeltaRatio > 0
                ? 'warning'
                : 'success',
          value: formatDeltaPercent(analytics.weeklyDeltaRatio),
        },
    {
      helper: 'Gasto variable acumulado en los últimos 7 días.',
      icon: 'receipt-long',
      label: 'Últimos 7 días',
      tone: 'default',
      value: currencyFormatter.format(analytics.currentWeekTotal),
    },
  ]

  const focusMetrics: IntelligenceMetric[] = []

  if (analytics.topCategory) {
    focusMetrics.push({
      helper: `${analytics.topCategory.label} suma ${currencyFormatter.format(
        analytics.topCategory.total,
      )} en este ciclo.`,
      icon: 'category',
      label: 'Categoría líder',
      tone: analytics.topCategory.share >= 0.35 ? 'warning' : 'default',
      value: `${Math.round(analytics.topCategory.share * 100)}%`,
      wide: true,
    })
  }

  if (analytics.recurringFocus) {
    focusMetrics.push({
      helper: `${analytics.recurringFocus.label} apareció ${analytics.recurringFocus.count} veces.`,
      icon: 'repeat',
      label: 'Gasto repetido',
      tone: 'warning',
      value: currencyFormatter.format(analytics.recurringFocus.total),
    })
  }

  if (analytics.weekendPremiumRatio != null && analytics.weekendPremiumRatio >= 1.05) {
    focusMetrics.push({
      helper: 'Compara sábados y domingos contra el promedio de lunes a viernes.',
      icon: 'weekend',
      label: 'Fin de semana',
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
