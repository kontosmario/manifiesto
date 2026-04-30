import { describe, expect, it } from 'vitest'

import {
  buildForecast7Day,
} from '@/features/insights/forecast-engine'
import { detectCausalLinks } from '@/features/insights/causal-engine'
import {
  inferPersona,
  framingFor,
  PERSONA_PROFILES,
} from '@/features/insights/persona'
import {
  aggregateInteractionStats,
  signalFamilyOf,
} from '@/features/insights/signal-family'
import {
  CONTROL_MOCK,
  computeControlView,
  type ControlView,
} from '@/features/insights/control-v2-mock'
import type { Expense } from '@/features/expenses/expense-repository'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'

// ─── Forecast 7d engine ──────────────────────────────────────────────

function makeView(): ControlView {
  return computeControlView(CONTROL_MOCK)
}

describe('buildForecast7Day', () => {
  it('returns 7-element daily arrays for each track', () => {
    const view = makeView()
    const out = buildForecast7Day({
      view,
      fixedExpenses: [],
      diasRestantes: view.diasRestantes,
      remaining: view.restanteMes,
      now: new Date('2026-04-22T10:00:00'),
    })
    expect(out.baseline.daily).toHaveLength(7)
    expect(out.optimistic.daily).toHaveLength(7)
    expect(out.pessimistic.daily).toHaveLength(7)
  })

  it('optimistic.totalProjected ≤ baseline.totalProjected ≤ pessimistic.totalProjected', () => {
    const view = makeView()
    const out = buildForecast7Day({
      view,
      fixedExpenses: [],
      diasRestantes: view.diasRestantes,
      remaining: view.restanteMes,
      now: new Date('2026-04-22T10:00:00'),
    })
    expect(out.optimistic.totalProjected).toBeLessThanOrEqual(out.baseline.totalProjected)
    expect(out.baseline.totalProjected).toBeLessThanOrEqual(out.pessimistic.totalProjected)
  })

  it('clamps horizon to min(7, diasRestantes)', () => {
    const view = makeView()
    const out = buildForecast7Day({
      view,
      fixedExpenses: [],
      diasRestantes: 3,
      remaining: view.restanteMes,
      now: new Date('2026-04-22T10:00:00'),
    })
    // Beyond day 3, daily entries should be 0.
    expect(out.baseline.daily[3]).toBe(0)
    expect(out.baseline.daily[6]).toBe(0)
  })

  it('flags a fixed-expense due date as an inflection day', () => {
    const view = makeView()
    const fixed: FixedExpense = {
      id: 'f1',
      family_id: 'fam',
      name: 'Netflix',
      amount: 5000,
      kind: 'periodic',
      status: 'active',
      frequency: 'monthly',
      category_id: null,
      next_due_on: '2026-04-25',
      day_of_month: 25,
      ends_on: null,
      installments_total: null,
      installments_paid: 0,
      remaining_balance: null,
      lender_name: null,
      notes: null,
      notify_days_before: null,
      last_paid_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const out = buildForecast7Day({
      view,
      fixedExpenses: [fixed],
      diasRestantes: view.diasRestantes,
      remaining: view.restanteMes,
      now: new Date('2026-04-22T10:00:00'),
    })
    const fixedInflection = out.inflectionDays.find(
      (d) => d.event === 'fixed_payment',
    )
    expect(fixedInflection).toBeDefined()
    expect(fixedInflection!.expectedAmount).toBe(5000)
  })
})

// ─── Causal engine ───────────────────────────────────────────────────

function expense(args: {
  id: string
  price: number
  createdAt: string
  categoryId?: string
  description?: string
}): Expense {
  return {
    id: args.id,
    family_id: 'fam',
    user_id: 'u1',
    creator_display_name: 'Mario',
    created_by: 'u1',
    category_id: args.categoryId ?? 'cat-default',
    commitment_id: null,
    created_at: args.createdAt,
    description: args.description ?? 'tx',
    price: args.price,
  }
}

describe('detectCausalLinks', () => {
  it('returns no links when history is below 14 closed days', () => {
    const out = detectCausalLinks({
      expenses: [expense({ id: '1', price: 1000, createdAt: '2026-04-01T10:00:00' })],
      closedDays: 5,
      now: new Date('2026-04-22T10:00:00'),
    })
    expect(out).toEqual([])
  })

  it('detects multi-tx-day stress spending when threshold is met', () => {
    // Build 5 days of "normal" + 4 days with 5+ transactions each that
    // total ~1.5× the normal day total.
    const expenses: Expense[] = []
    let counter = 0
    for (let day = 1; day <= 7; day++) {
      const iso = `2026-04-${String(day).padStart(2, '0')}`
      // baseline day: 2 tx of 500 each = 1000
      expenses.push(expense({ id: `b-${counter++}`, price: 500, createdAt: `${iso}T10:00:00` }))
      expenses.push(expense({ id: `b-${counter++}`, price: 500, createdAt: `${iso}T18:00:00` }))
    }
    for (let day = 8; day <= 12; day++) {
      const iso = `2026-04-${String(day).padStart(2, '0')}`
      // stress day: 5 tx of 350 each = 1750 (1.75× baseline)
      for (let i = 0; i < 5; i++) {
        expenses.push(
          expense({
            id: `s-${counter++}`,
            price: 350,
            createdAt: `${iso}T${String(8 + i * 2).padStart(2, '0')}:00:00`,
          }),
        )
      }
    }
    const out = detectCausalLinks({
      expenses,
      closedDays: 21,
      now: new Date('2026-04-13T10:00:00'),
    })
    const stress = out.find((l) => l.cause.value === 'multi-tx-day')
    expect(stress).toBeDefined()
    expect(stress!.effect.magnitude).toBeGreaterThan(0.3)
    expect(stress!.confidence).toBeGreaterThan(0.4)
  })

  it('does not detect paired-impulse when pairs are too small', () => {
    const expenses = [
      expense({ id: '1', price: 1000, createdAt: '2026-04-01T10:00:00', categoryId: 'cat-a' }),
      expense({ id: '2', price: 100, createdAt: '2026-04-01T10:30:00', categoryId: 'cat-a' }),
    ]
    const out = detectCausalLinks({
      expenses,
      closedDays: 21,
      now: new Date('2026-04-22T10:00:00'),
    })
    expect(out.find((l) => l.cause.type === 'category')).toBeUndefined()
  })
})

// ─── Persona inference ───────────────────────────────────────────────

describe('inferPersona', () => {
  it('defaults to planner during cold start (<10 shown)', () => {
    expect(
      inferPersona({
        perFamily: {},
        overall: { totalShown: 0, totalActed: 0, overallCtr: 0 },
      }),
    ).toBe('planner')
    expect(
      inferPersona({
        perFamily: {},
        overall: { totalShown: 5, totalActed: 4, overallCtr: 0.8 },
      }),
    ).toBe('planner')
  })

  it('classifies an avoider when overall CTR < 10%', () => {
    expect(
      inferPersona({
        perFamily: {},
        overall: { totalShown: 50, totalActed: 3, overallCtr: 0.06 },
      }),
    ).toBe('avoider')
  })

  it('classifies a firefighter when critical-only CTR is high and insight CTR is low', () => {
    const out = inferPersona({
      perFamily: {
        'recovery-hard': {
          shown: 10,
          acted: 8,
          dismissed: 2,
          ctr: 0.8,
          medianTimeToActionMs: null,
          lastSeenAt: null,
        },
        'small-leaks': {
          shown: 10,
          acted: 1,
          dismissed: 9,
          ctr: 0.1,
          medianTimeToActionMs: null,
          lastSeenAt: null,
        },
      },
      overall: { totalShown: 20, totalActed: 9, overallCtr: 0.45 },
    })
    expect(out).toBe('firefighter')
  })

  it('framingFor maps each persona to its declared framing', () => {
    expect(framingFor('planner')).toBe(PERSONA_PROFILES.planner.framing)
    expect(framingFor('firefighter')).toBe(PERSONA_PROFILES.firefighter.framing)
    expect(framingFor('avoider')).toBe(PERSONA_PROFILES.avoider.framing)
    expect(framingFor('optimizer')).toBe(PERSONA_PROFILES.optimizer.framing)
  })
})

// ─── Interaction stats ───────────────────────────────────────────────

describe('aggregateInteractionStats', () => {
  it('returns empty stats for an empty input', () => {
    const out = aggregateInteractionStats([])
    expect(out.overall.totalShown).toBe(0)
    expect(out.overall.totalActed).toBe(0)
    expect(out.overall.overallCtr).toBe(0)
  })

  it('aggregates per-family CTR correctly across multiple outcomes', () => {
    const rows = [
      { signal_family: 'velocity', outcome: 'shown_only', time_to_action_ms: null, created_at: '2026-04-20T10:00:00Z' },
      { signal_family: 'velocity', outcome: 'acted', time_to_action_ms: 2000, created_at: '2026-04-21T10:00:00Z' },
      { signal_family: 'velocity', outcome: 'dismissed', time_to_action_ms: null, created_at: '2026-04-22T10:00:00Z' },
      { signal_family: 'streak-ok', outcome: 'shown_only', time_to_action_ms: null, created_at: '2026-04-22T11:00:00Z' },
    ]
    const out = aggregateInteractionStats(rows)
    // velocity: 3 shown total, 1 acted → ctr = 1/3
    expect(out.perFamily.velocity.shown).toBe(3)
    expect(out.perFamily.velocity.acted).toBe(1)
    expect(out.perFamily.velocity.ctr).toBeCloseTo(1 / 3, 4)
    expect(out.perFamily.velocity.medianTimeToActionMs).toBe(2000)
    // overall: 4 shown, 1 acted → 0.25
    expect(out.overall.totalShown).toBe(4)
    expect(out.overall.totalActed).toBe(1)
    expect(out.overall.overallCtr).toBeCloseTo(0.25, 4)
  })
})

describe('signalFamilyOf', () => {
  it.each([
    ['velocity', 'velocity'],
    ['streak-ok', 'streak-ok'],
    ['zombie-abc-123', 'zombie'],
    ['hike-xyz', 'hike'],
    ['cap-rest-warn', 'cap'],
    ['cat-dominance-restaurantes', 'cat-dominance'],
    ['undetected-sub-3500', 'undetected-sub'],
    ['member-imbalance-u1', 'member-imbalance'],
    ['causal-friday-cascade', 'causal'],
    ['duplicate-abc', 'duplicate'],
    ['super-perfect-storm', 'super-perfect-storm'],
  ])('signalFamilyOf(%s) === %s', (input, expected) => {
    expect(signalFamilyOf(input)).toBe(expected)
  })
})

// ─── Ranking + diversity budget (integration through buildControlSignals) ─

describe('control-signals — ranking + diversity budget', () => {
  it('blockedFamilies hard-mutes signals of that family', async () => {
    const { buildControlSignals } = await import('@/features/insights/control-signals')
    const view = computeControlView(CONTROL_MOCK)
    const out = buildControlSignals({
      view,
      expenses: [],
      fixedExpenses: [],
      categoriesExpense: [],
      summaries: [],
      limits: [],
      velocity: null,
      notifications: [],
      savingsGoal: null,
      cupoDiario: CONTROL_MOCK.cupoDiario,
      gastoHoy: CONTROL_MOCK.gastoHoy,
      diasRestantes: view.diasRestantes,
      ingresoMes: CONTROL_MOCK.ingresoMes,
      fijosMes: CONTROL_MOCK.fijosMes,
      now: new Date('2026-04-22T14:20:00'),
      blockedFamilies: new Set(['positive-forecast']),
    })
    expect(out.find((s) => s.id === 'positive-forecast')).toBeUndefined()
  })

  it('paydayPending=true surfaces income-missing as alta urgency', async () => {
    const { buildControlSignals } = await import('@/features/insights/control-signals')
    const view = computeControlView(CONTROL_MOCK)
    const out = buildControlSignals({
      view,
      expenses: [],
      fixedExpenses: [],
      categoriesExpense: [],
      summaries: [],
      limits: [],
      velocity: null,
      notifications: [],
      savingsGoal: null,
      cupoDiario: CONTROL_MOCK.cupoDiario,
      gastoHoy: CONTROL_MOCK.gastoHoy,
      diasRestantes: view.diasRestantes,
      ingresoMes: CONTROL_MOCK.ingresoMes,
      fijosMes: CONTROL_MOCK.fijosMes,
      now: new Date('2026-04-22T14:20:00'),
      paydayPending: true,
    })
    const income = out.find((s) => s.id === 'income-missing')
    expect(income).toBeDefined()
    expect(income!.urgency).toBe('alta')
  })
})
