import { describe, it, expect } from 'vitest'
import { buildWrappedPayloadFromSummary } from '@/features/wrapped/build-wrapped-payload'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'

function makeSummary(overrides: Partial<MonthlySummaryHistory> = {}): MonthlySummaryHistory {
  return {
    id: 'sum-1',
    period_start: '2026-03-01',
    period_end: '2026-04-01',
    period_label: 'Marzo 2026',
    total_variable_spent: 100_000,
    total_spent: 150_000,
    expenses_count: 12,
    monthly_income: 200_000,
    savings_delta: 50_000,
    category_breakdown: null,
    daily_totals: null,
    by_member: null,
    top_expense: null,
    delta_vs_previous_percent: null,
    mood: null,
    wrapped_seen_at: null,
    ...overrides,
  }
}

describe('buildWrappedPayloadFromSummary', () => {
  it('mapea campos básicos a partir del summary', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary(),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.periodLabel).toBe('Marzo 2026')
    expect(payload.totalSpent).toBe(150_000)
    expect(payload.monthlyIncome).toBe(200_000)
    expect(payload.savingsDelta).toBe(50_000)
    expect(payload.expensesCount).toBe(12)
    expect(payload.deltaVsPreviousPercent).toBeNull()
    expect(payload.mood).toBeNull()
    expect(payload.topCategory).toBeNull()
    expect(payload.topExpense).toBeNull()
    expect(payload.achievementsEarnedInCycle).toBe(0)
  })

  it('periodRange null cuando el ciclo es calendario (1→1)', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ period_start: '2026-03-01', period_end: '2026-04-01' }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.periodRange).toBeNull()
  })

  it('periodRange formatea rango cuando el ciclo NO es calendario', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ period_start: '2026-03-15', period_end: '2026-04-15' }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    // period_end es exclusivo — el día display es 14 abr
    expect(payload.periodRange).toBe('15 mar – 14 abr')
  })

  it('topCategory pickeado desde breakdown array, con share clamped a [0,1]', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        total_spent: 100_000,
        category_breakdown: [
          { category_id: 'cat-comida', name: 'Comida', total: 60_000 } as any,
          { category_id: 'cat-otros', name: 'Otros', total: 40_000 } as any,
        ],
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.topCategory).not.toBeNull()
    expect(payload.topCategory!.name).toBe('Comida')
    expect(payload.topCategory!.amount).toBe(60_000)
    expect(payload.topCategory!.share).toBeCloseTo(0.6, 5)
  })

  it('topCategory pickeado desde breakdown record (legacy), nombre desde lookup', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        total_spent: 50_000,
        category_breakdown: {
          'cat-A': { amount: 30_000, count: 5 },
          'cat-B': { amount: 20_000, count: 3 },
        } as any,
      }),
      categoryNameById: new Map([['cat-A', 'Transporte']]),
      achievementsEarnedAt: [],
    })
    expect(payload.topCategory).not.toBeNull()
    expect(payload.topCategory!.name).toBe('Transporte')
    expect(payload.topCategory!.amount).toBe(30_000)
  })

  it('topCategory uncategorized usa "Sin categoría"', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        total_spent: 10_000,
        category_breakdown: {
          '__uncat__': { amount: 10_000, count: 1 },
        } as any,
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.topCategory!.name).toBe('Sin categoría')
  })

  it('topCategory es null cuando todos los amounts son 0', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        total_spent: 0,
        category_breakdown: [
          { category_id: 'cat-A', name: 'X', total: 0 } as any,
        ],
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.topCategory).toBeNull()
  })

  it('topExpense mapea description + price + occurredAt desde el row', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        top_expense: {
          id: 'e1',
          description: 'Notebook',
          price: 250_000,
          category_id: null,
          created_at: '2026-03-12T15:00:00Z',
        } as any,
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.topExpense).toEqual({
      description: 'Notebook',
      price: 250_000,
      occurredAt: '2026-03-12T15:00:00Z',
    })
  })

  it('topExpense fallback a description vacío y occurredAt = period_start', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        period_start: '2026-03-01',
        top_expense: { id: 'e1' } as any,
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.topExpense).toEqual({
      description: '',
      price: 0,
      occurredAt: '2026-03-01',
    })
  })

  it('achievementsEarnedInCycle cuenta solo los earnedAt dentro de [start, end)', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ period_start: '2026-03-01', period_end: '2026-04-01' }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [
        '2026-02-28T10:00:00', // antes → no cuenta
        '2026-03-10T10:00:00', // dentro
        '2026-03-31T23:59:59', // dentro
        '2026-04-01T00:00:00', // exclusivo → no cuenta
        '2026-05-01T10:00:00', // fuera
        'not-a-date',          // inválida → no cuenta
      ],
    })
    expect(payload.achievementsEarnedInCycle).toBe(2)
  })

  it('preserva pendingLeftoverDecision / activeGoal / nextCycleAnchor / callback', () => {
    const onApply = async () => {}
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary(),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
      pendingLeftoverDecision: { monthlySummaryId: 'sum-1', sobrante: 40_000 },
      activeGoal: { id: 'goal-1', title: 'Auto', emoji: '🚗' },
      nextCycleAnchor: '2026-04-01',
      onApplyLeftoverDecision: onApply,
    })
    expect(payload.pendingLeftoverDecision).toEqual({
      monthlySummaryId: 'sum-1',
      sobrante: 40_000,
    })
    expect(payload.activeGoal?.title).toBe('Auto')
    expect(payload.nextCycleAnchor).toBe('2026-04-01')
    expect(payload.onApplyLeftoverDecision).toBe(onApply)
  })

  it('preserva pastLeftoverDecision (replay read-only)', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary(),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
      pastLeftoverDecision: {
        decision: 'meta',
        sobrante: 25_000,
        metaGoalTitle: 'Viaje',
        decidedAt: '2026-04-01T10:00:00Z',
      },
    })
    expect(payload.pastLeftoverDecision?.decision).toBe('meta')
    expect(payload.pastLeftoverDecision?.metaGoalTitle).toBe('Viaje')
  })

  it('coerce numéricos faltantes a 0 (resilient a partial rows)', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({
        total_spent: undefined as any,
        monthly_income: undefined as any,
        savings_delta: undefined as any,
        expenses_count: undefined as any,
      }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.totalSpent).toBe(0)
    expect(payload.monthlyIncome).toBe(0)
    expect(payload.savingsDelta).toBe(0)
    expect(payload.expensesCount).toBe(0)
  })

  it('savingsDelta negativo (excedido) se preserva con su signo', () => {
    // Excedido: gastó más que (sueldo + extra) − ahorro comprometido.
    // El veredicto usa computeCycleSurplusSigned (signed, NO clampeado, NO
    // savings_delta): 200k income − 215k gasto = −15k.
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ total_spent: 215_000 }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.savingsDelta).toBe(-15_000)
  })

  it('savingsDelta incluye el extra_income del ciclo (arrastre)', () => {
    // Headline del modelo del sobrante (2026-06-23): el income extra del
    // ciclo suma al veredicto. 200k income + 100k extra − 150k gasto = 150k.
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ extra_income: 100_000 }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.savingsDelta).toBe(150_000)
  })

  it('deltaVsPreviousPercent numérico se preserva', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ delta_vs_previous_percent: -12.5 }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.deltaVsPreviousPercent).toBe(-12.5)
  })

  it('mood se preserva tal cual', () => {
    const payload = buildWrappedPayloadFromSummary({
      summary: makeSummary({ mood: 'great' }),
      categoryNameById: new Map(),
      achievementsEarnedAt: [],
    })
    expect(payload.mood).toBe('great')
  })
})
