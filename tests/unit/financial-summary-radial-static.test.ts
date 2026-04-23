import { describe, expect, it } from 'vitest'
import { buildFinancialSummaryStaticModel } from '@/components/home/financial-summary-radial.static'
import { buildTheme } from '@/theme/palette'

describe('financial-summary-radial.static', () => {
  it('arma segmentos, transiciones y anchors para la variante overview', () => {
    const model = buildFinancialSummaryStaticModel({
      availableValue: 45_000,
      compact: false,
      fixedValue: 30_000,
      monthlyIncome: 120_000,
      savingsGoal: 20_000,
      savingsValue: 15_000,
      spentValue: 30_000,
      theme: buildTheme('light'),
      variant: 'overview',
    })

    expect(model.chartBase).toBe(120_000)
    expect(model.availablePercent).toBe(38)
    expect(model.segments.filter((segment) => segment.share > 0)).toHaveLength(4)
    expect(model.drawnSegments).toHaveLength(4)
    expect(model.segmentTransitions).toHaveLength(3)
    expect(model.loopClosure).not.toBeNull()
    expect(model.badgeLayouts).toHaveLength(4)
    expect(model.segmentValueAnchors).toHaveLength(4)
    expect(model.useCompactLegend).toBe(true)
  })

  it('ajusta geometría compacta para la variante daily', () => {
    const model = buildFinancialSummaryStaticModel({
      availableValue: 8_000,
      compact: true,
      fixedValue: 2_000,
      monthlyIncome: 20_000,
      savingsGoal: 0,
      savingsValue: 0,
      spentValue: 10_000,
      theme: buildTheme('dark'),
      variant: 'daily',
    })

    expect(model.isDailyVariant).toBe(true)
    expect(model.donutSize).toBe(224)
    expect(model.strokeWidth).toBe(32)
    expect(model.stageSize).toBeGreaterThan(model.donutSize)
    expect(model.centerDisplayValue).toBe(8_000)
  })
})
