import { describe, expect, it } from 'vitest'
import { buildDailyBudgetRingViewModel, getDailyBudgetStatusPalette } from '@/components/home/daily-budget-ring.model'
import { buildTheme } from '@/theme/palette'

const lightTheme = buildTheme('light')

describe('daily-budget-ring-model', () => {
  it('usa warning para estado crítico', () => {
    const palette = getDailyBudgetStatusPalette(lightTheme, 'critical')

    expect(palette.trackColor).toBe(lightTheme.colors.warning)
    expect(palette.valueColor).toBe(lightTheme.colors.warning)
  })

  it('arma footnote compacta y progreso normal cuando no está excedido', () => {
    const model = buildDailyBudgetRingViewModel({
      compact: true,
      openingBudget: 20000,
      projectedTomorrowOpening: 16500,
      remainingRatio: 0.62,
      remainingToday: 12400,
      status: 'balanced',
      theme: lightTheme,
      visibleProgress: 0.5,
    })

    expect(model.centerLabel).toBe('Disponible hoy')
    expect(model.mainProgress).toBe(0.31)
    expect(model.overrunProgress).toBe(0)
    expect(model.footnote).toContain('Mañana')
  })

  it('muestra sobreconsumo completo cuando el día está excedido', () => {
    const model = buildDailyBudgetRingViewModel({
      compact: false,
      openingBudget: 10000,
      projectedTomorrowOpening: -2500,
      remainingRatio: 0,
      remainingToday: -2500,
      status: 'exceeded',
      theme: lightTheme,
      visibleProgress: 0.8,
    })

    expect(model.centerLabel).toBe('Pasado hoy')
    expect(model.mainProgress).toBe(1)
    expect(model.overrunProgress).toBe(0.2)
  })
})
