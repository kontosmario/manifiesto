import { describe, expect, it } from 'vitest'
import {
  buildControlSignals,
  type CategoryLimit,
  type NotificationLite,
  type VelocitySnapshot,
} from '@/features/insights/control-signals'
import {
  CONTROL_MOCK,
  computeControlView,
} from '@/features/insights/control-v2-mock'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'

const NOW = new Date('2026-04-22T14:20:00')

// Shared baseline: no limits, no notifications, no velocity. Everything
// below overrides one slice at a time so each rule is isolated.
function baseArgs(overrides: Partial<Parameters<typeof buildControlSignals>[0]> = {}) {
  const view = computeControlView(CONTROL_MOCK)
  return {
    view,
    expenses: [],
    fixedExpenses: [],
    categoriesExpense: [],
    summaries: [] as MonthlySummaryHistory[],
    limits: [] as CategoryLimit[],
    velocity: null as VelocitySnapshot | null,
    notifications: [] as NotificationLite[],
    savingsGoal: null,
    cupoDiario: CONTROL_MOCK.cupoDiario,
    gastoHoy: CONTROL_MOCK.gastoHoy,
    diasRestantes: view.diasRestantes,
    ingresoMes: CONTROL_MOCK.ingresoMes,
    fijosMes: CONTROL_MOCK.fijosMes,
    now: NOW,
    ...overrides,
  }
}

describe('control-signals', () => {
  it('returns a bounded number of signals and all items share the shape', () => {
    const out = buildControlSignals(baseArgs())
    expect(out.length).toBeGreaterThanOrEqual(0)
    expect(out.length).toBeLessThanOrEqual(5)
    for (const s of out) {
      expect(typeof s.id).toBe('string')
      expect(typeof s.title).toBe('string')
      expect(['alta', 'media', 'baja']).toContain(s.urgency)
    }
  })

  it('on the reference CONTROL_MOCK, surfaces the positive forecast', () => {
    // CONTROL_MOCK is a healthy-but-imperfect state (alcanzaElMes=true,
    // has a comfortable buffer). The signals engine should pick up at
    // least the positive forecast with urgency="baja".
    const out = buildControlSignals(baseArgs())
    const positive = out.find((s) => s.id === 'positive-forecast')
    expect(positive).toBeDefined()
    expect(positive!.urgency).toBe('baja')
  })

  it('flags a stress week when 3+ fijos are due inside 7 days', () => {
    const out = buildControlSignals(
      baseArgs({
        fixedExpenses: [
          { id: 'a', amount: 10000, status: 'pending', next_due_on: '2026-04-24' },
          { id: 'b', amount: 20000, status: 'pending', next_due_on: '2026-04-25' },
          { id: 'c', amount: 30000, status: 'pending', next_due_on: '2026-04-27' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
        ] as any[],
      }),
    )
    expect(out.some((s) => s.id === 'stress-week')).toBe(true)
    const stress = out.find((s) => s.id === 'stress-week')!
    expect(stress.impactRaw).toBe(60000)
    expect(stress.urgency).toBe('alta')
  })

  it('flags a category cap breach with the right urgency', () => {
    const view = computeControlView(CONTROL_MOCK)
    const out = buildControlSignals({
      ...baseArgs({
        expenses: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'e1', category_id: 'cat-ocio', price: 35000, created_at: '2026-04-20', commitment_id: null } as any,
        ],
        categoriesExpense: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'cat-ocio', name: 'Ocio' } as any,
        ],
        limits: [
          {
            id: 'lim-ocio',
            category_id: 'cat-ocio',
            monthly_cap: 20000,
            warning_threshold_pct: 80,
          },
        ],
        view,
      }),
    })
    const breach = out.find((s) => s.id === 'cap-lim-ocio')
    expect(breach).toBeDefined()
    expect(breach!.urgency).toBe('alta')
    expect(breach!.impactRaw).toBe(15000) // 35000 - 20000
  })

  // Regresión 2026-06-23: pagar un fijo inserta en `expenses` una fila con
  // commitment_id = id del fijo. Esos pagos están contemplados y NO deben
  // generar ruido (movimiento alto / duplicado). Antes del fix, las dos
  // señales de abajo iteraban `expenses` sin excluir commitment_id.
  it('does NOT flag "Movimiento alto hoy" for a fixed-expense payment', () => {
    const out = buildControlSignals(
      baseArgs({
        cupoDiario: 100000,
        expenses: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'fx', category_id: 'cat', price: 300000, created_at: '2026-04-22T10:00:00', commitment_id: 'fixed-1' } as any,
        ],
      }),
    )
    expect(out.find((s) => s.id === 'high-single-expense')).toBeUndefined()
  })

  it('flags "Movimiento alto hoy" for the same amount as a discretionary expense', () => {
    // Control positivo: idéntico al anterior pero gasto variable
    // (commitment_id null) — confirma que el filtro es lo único que cambia.
    const out = buildControlSignals(
      baseArgs({
        cupoDiario: 100000,
        expenses: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'd', category_id: 'cat', price: 300000, created_at: '2026-04-22T10:00:00', commitment_id: null } as any,
        ],
      }),
    )
    expect(out.find((s) => s.id === 'high-single-expense')).toBeDefined()
  })

  it('does NOT flag "cargos parecidos" for two fixed-expense payments in 48h', () => {
    const out = buildControlSignals(
      baseArgs({
        expenses: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'f1', category_id: 'cat', description: 'Netflix', price: 5000, created_at: '2026-04-21T10:00:00', commitment_id: 'fixed-1' } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'f2', category_id: 'cat', description: 'Netflix', price: 5000, created_at: '2026-04-22T10:00:00', commitment_id: 'fixed-1' } as any,
        ],
      }),
    )
    expect(out.find((s) => s.id.startsWith('duplicate-'))).toBeUndefined()
  })

  it('caps output at 5 tasks and ranks by urgency then impact', () => {
    const view = computeControlView(CONTROL_MOCK)
    const out = buildControlSignals(
      baseArgs({
        view,
        fixedExpenses: [
          { id: 'a', amount: 10000, status: 'pending', next_due_on: '2026-04-24' },
          { id: 'b', amount: 20000, status: 'pending', next_due_on: '2026-04-25' },
          { id: 'c', amount: 30000, status: 'pending', next_due_on: '2026-04-27' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
        ] as any[],
        notifications: [
          {
            id: 'n1',
            kind: 'zombie_alert',
            severity: 'warning',
            created_at: '2026-04-20T10:00:00',
            metadata: { name: 'Netflix', amount: 4500 },
          },
          {
            id: 'n2',
            kind: 'zombie_alert',
            severity: 'warning',
            created_at: '2026-04-21T10:00:00',
            metadata: { name: 'Spotify', amount: 2500 },
          },
          {
            id: 'n3',
            kind: 'price_hike',
            severity: 'info',
            created_at: '2026-04-22T10:00:00',
            metadata: {
              name: 'Luz',
              previous_amount: 28000,
              new_amount: 32500,
              delta_pct: 16,
            },
          },
        ],
      }),
    )
    expect(out.length).toBeLessThanOrEqual(5)
    // First item must be the highest-urgency one
    expect(out[0]!.urgency).toBe('alta')
  })

  it('builds a recovery path when today overspends but not catastrophic', () => {
    const view = computeControlView({
      ...CONTROL_MOCK,
      gastoHoy: 50000, // > cupoDiario (31600) — generates negative delta
    })
    const out = buildControlSignals(
      baseArgs({
        view,
        gastoHoy: 50000,
      }),
    )
    const recovery = out.find((s) => s.id.startsWith('recovery'))
    expect(recovery).toBeDefined()
  })

  it('detects a night-impulse pattern when >60% of spend is after 20hs', () => {
    const night: Array<{
      id: string
      category_id: string
      price: number
      created_at: string
      commitment_id: null
    }> = []
    for (let i = 0; i < 12; i++) {
      night.push({
        id: `n${i}`,
        category_id: 'cat',
        price: 2000,
        created_at: `2026-04-${String(10 + (i % 10)).padStart(2, '0')}T22:30:00`,
        commitment_id: null,
      })
    }
    // a few daytime expenses (small) so night isn't 100%
    const day: Array<{
      id: string
      category_id: string
      price: number
      created_at: string
      commitment_id: null
    }> = [
      { id: 'd1', category_id: 'cat', price: 500, created_at: '2026-04-12T10:00:00', commitment_id: null },
      { id: 'd2', category_id: 'cat', price: 500, created_at: '2026-04-14T12:00:00', commitment_id: null },
    ]
    const out = buildControlSignals(
      baseArgs({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
        expenses: [...night, ...day] as any[],
      }),
    )
    expect(out.some((s) => s.id === 'night-impulse')).toBe(true)
  })

  it('detects category dominance when one cat > 40% of discretionary', () => {
    const list: Array<{
      id: string
      category_id: string
      price: number
      created_at: string
      commitment_id: null
    }> = [
      { id: '1', category_id: 'a', price: 60000, created_at: '2026-04-10T09:00:00', commitment_id: null },
      { id: '2', category_id: 'b', price: 20000, created_at: '2026-04-11T09:00:00', commitment_id: null },
      { id: '3', category_id: 'c', price: 10000, created_at: '2026-04-12T09:00:00', commitment_id: null },
    ]
    const out = buildControlSignals(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
      baseArgs({
        expenses: list as any[],
        categoriesExpense: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'a', name: 'Ocio' } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'b', name: 'Super' } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
          { id: 'c', name: 'Transporte' } as any,
        ],
      }),
    )
    expect(out.some((s) => s.id.startsWith('cat-dominance'))).toBe(true)
  })
})
