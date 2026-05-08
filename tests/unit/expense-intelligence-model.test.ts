import { describe, expect, it } from 'vitest'
import { buildExpenseIntelligenceViewModel } from '@/features/expenses/expense-intelligence-model'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'

const baseAnalytics: ExpenseAnalyticsSummary = {
  adjustmentNeededPerDay: 0,
  currentWeekTotal: 42000,
  daysRemainingInCycle: 8,
  forecastSeries: [
    { dateIso: '2026-04-21T03:00:00.000Z', projectedSpend: 5000 },
  ],
  needsAttention: false,
  projectedAvailableAtCycleEnd: 18000,
  projectedCycleTotal: 215000,
  recurringFocus: null,
  recommendedDailyCap: 7200,
  suggestions: [
    { detail: 'Texto 1', title: 'S1', tone: 'primary' },
    { detail: 'Texto 2', title: 'S2', tone: 'warning' },
    { detail: 'Texto 3', title: 'S3', tone: 'success' },
    { detail: 'Texto 4', title: 'S4', tone: 'primary' },
  ],
  topCategory: null,
  weekendPremiumRatio: null,
  weeklyDeltaRatio: 0.12,
}

describe('expense-intelligence-model', () => {
  it('arma métricas principales y limita sugerencias visibles', () => {
    const model = buildExpenseIntelligenceViewModel(baseAnalytics)

    expect(model.metricTone).toBe('success')
    expect(model.leadMetrics).toHaveLength(3)
    expect(model.leadMetrics[1]?.label).toBe('Ritmo semanal')
    expect(model.leadMetrics[1]?.value).toBe('+12%')
    expect(model.suggestions).toHaveLength(3)
  })

  it('genera foco de recorte cuando falta ajuste diario', () => {
    const model = buildExpenseIntelligenceViewModel({
      ...baseAnalytics,
      adjustmentNeededPerDay: 2500,
      needsAttention: true,
      projectedAvailableAtCycleEnd: -12000,
    })

    expect(model.hasRisk).toBe(true)
    expect(model.metricTone).toBe('warning')
    expect(model.leadMetrics[1]?.label).toBe('Baja por día') // copy refresh
  })

  it('detecta focos de categoría, repetición y fin de semana', () => {
    const model = buildExpenseIntelligenceViewModel({
      ...baseAnalytics,
      recurringFocus: { count: 4, label: 'Delivery', total: 21000 },
      topCategory: { label: 'Comida', share: 0.41, total: 68000 },
      weekendPremiumRatio: 1.27,
    })

    expect(model.focusMetrics.map((metric) => metric.label)).toEqual([
      'Categoría líder',
      'Gasto repetido',
      'Fin de semana',
    ])
  })
})
