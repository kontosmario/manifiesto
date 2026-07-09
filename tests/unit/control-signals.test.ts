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
import type { SubscriptionCheckin } from '@/features/subscriptions-zombie/usage-checkin'

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
        // Sub-usage hard-flag → urgency 'alta' (reemplaza los zombie_alert del
        // Sistema A retirado 2026-06-23). 3 'casi_nunca' → CTA Cancelar.
        subscriptionCheckins: [
          {
            fixedExpenseId: 'fe-netflix',
            name: 'Netflix',
            amount: 4500,
            lastPaymentAt: '2026-04-21T10:00:00',
            lastAuditAt: '2026-04-10T10:00:00',
            recentLevels: ['casi_nunca', 'casi_nunca', 'casi_nunca'],
            hasOpenCancelIntent: false,
          },
        ],
        notifications: [
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

  // ── Sub-usage check-in (reemplaza el zombi por ausencia-de-pago, 2026-06-23) ──
  const subCheckin = (over: Partial<SubscriptionCheckin> = {}): SubscriptionCheckin => ({
    fixedExpenseId: 'fe1',
    name: 'Netflix',
    amount: 4500,
    lastPaymentAt: null,
    lastAuditAt: null,
    recentLevels: [],
    hasOpenCancelIntent: false,
    ...over,
  })

  it('sub-usage: pago sin responder → emite card con 3 réplicas', () => {
    const out = buildControlSignals(
      baseArgs({ subscriptionCheckins: [subCheckin({ lastPaymentAt: '2026-04-21T10:00:00', lastAuditAt: '2026-04-01T10:00:00' })] }),
    )
    const card = out.find((s) => s.id.startsWith('sub-usage-'))
    expect(card).toBeDefined()
    expect(card!.replies).toHaveLength(3)
  })

  it('sub-usage: respondió hace <15d → no card', () => {
    const out = buildControlSignals(
      baseArgs({ subscriptionCheckins: [subCheckin({ lastAuditAt: '2026-04-20T10:00:00', recentLevels: ['a_veces'] })] }),
    )
    expect(out.find((s) => s.id.startsWith('sub-usage-'))).toBeUndefined()
  })

  it('sub-usage: 3 negativas → flag fuerte con acción cancelar', () => {
    const out = buildControlSignals(
      baseArgs({ subscriptionCheckins: [subCheckin({ lastAuditAt: '2026-04-01T10:00:00', recentLevels: ['casi_nunca', 'casi_nunca', 'casi_nunca'] })] }),
    )
    const card = out.find((s) => s.id.startsWith('sub-usage-'))
    expect(card).toBeDefined()
    expect(card!.urgency).toBe('alta')
    expect(card!.replies!.some((r) => r.action.kind === 'sub-usage-cancel')).toBe(true)
  })

  it('sub-usage: intent de cancelar abierto → no card', () => {
    const out = buildControlSignals(
      baseArgs({ subscriptionCheckins: [subCheckin({ lastPaymentAt: '2026-04-21T10:00:00', hasOpenCancelIntent: true })] }),
    )
    expect(out.find((s) => s.id.startsWith('sub-usage-'))).toBeUndefined()
  })

  it('sub-usage: cap de 2 cards de uso', () => {
    const checkins = [0, 1, 2].map((i) =>
      subCheckin({ fixedExpenseId: `fe${i}`, name: `Sub${i}`, lastPaymentAt: '2026-04-21T10:00:00', lastAuditAt: '2026-04-01T10:00:00' }),
    )
    const out = buildControlSignals(baseArgs({ subscriptionCheckins: checkins }))
    expect(out.filter((s) => s.id.startsWith('sub-usage-')).length).toBeLessThanOrEqual(2)
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
      baseArgs({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
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

describe('control-signals — modo INGRESO DINÁMICO', () => {
  it('income-missing dinámico dispara pasado el 30% del ciclo sin ingresos', () => {
    const out = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        ingresoMes: 0,
        ingresoRecurrente: 0,
        diasCiclo: 30,
        diasRestantes: 15, // 15 días transcurridos ≥ ceil(30·0.3)
      }),
    )
    const missing = out.find((s) => s.id === 'income-missing')
    expect(missing).toBeDefined()
    expect(missing?.body).not.toMatch(/sueldo|cobro/i)
  })

  it('income-missing dinámico NO dispara al inicio del ciclo ni con ingresos cargados', () => {
    const early = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        ingresoMes: 0,
        ingresoRecurrente: 0,
        diasCiclo: 30,
        diasRestantes: 29, // día 1
      }),
    )
    expect(early.find((s) => s.id === 'income-missing')).toBeUndefined()

    const funded = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        ingresoMes: 300_000,
        ingresoRecurrente: 300_000,
        diasCiclo: 30,
        diasRestantes: 15,
      }),
    )
    expect(funded.find((s) => s.id === 'income-missing')).toBeUndefined()
  })

  it('income-missing dinámico guarda el invariante sin diasCiclo (silencio, no basura)', () => {
    const out = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        ingresoMes: 0,
        ingresoRecurrente: 0,
        // diasCiclo ausente a propósito
      }),
    )
    expect(out.find((s) => s.id === 'income-missing')).toBeUndefined()
  })

  it('income-volatility dinámico compara contra el histórico de extra_income', () => {
    const summary = (extra: number, i: number): MonthlySummaryHistory =>
      ({
        id: `s-${i}`,
        period_start: `2026-0${4 + i}-01`,
        period_end: `2026-0${5 + i}-01`,
        period_label: `Mes ${i}`,
        total_variable_spent: 100_000,
        total_spent: 120_000,
        expenses_count: 10,
        monthly_income: 0, // dinámico: sueldo histórico 0 por diseño
        savings_delta: 0,
        extra_income: extra,
        savings_goal_amount: 0,
        category_breakdown: null,
        daily_totals: null,
        delta_vs_previous_percent: null,
        mood: null,
        top_expense: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
      }) as any
    // Semántica post-review 2026-07-08: en dinámico se comparan ciclos
    // CERRADOS entre sí (último cierre vs promedio de los anteriores) —
    // la suma PARCIAL del ciclo en curso (ingresoRecurrente) NO
    // participa (daba falso "tu ingreso bajó" toda la primera mitad
    // de cada ciclo).
    const out = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        // Parcial del ciclo en curso bajo a propósito: debe ser ignorado.
        ingresoRecurrente: 100_000,
        ingresoMes: 100_000,
        // Último cierre 800k vs histórico 500k → +60% dispara.
        summaries: [summary(800_000, 1), summary(500_000, 2), summary(500_000, 3)],
      }),
    )
    expect(out.find((s) => s.id === 'income-volatility')).toBeDefined()
  })

  it('income-volatility dinámico NO dispara por el parcial del ciclo en curso', () => {
    const summary = (extra: number, i: number): MonthlySummaryHistory =>
      ({
        id: `s-${i}`,
        period_start: `2026-0${4 + i}-01`,
        period_end: `2026-0${5 + i}-01`,
        period_label: `Mes ${i}`,
        total_variable_spent: 100_000,
        total_spent: 120_000,
        expenses_count: 10,
        monthly_income: 0,
        savings_delta: 0,
        extra_income: extra,
        savings_goal_amount: 0,
        category_breakdown: null,
        daily_totals: null,
        delta_vs_previous_percent: null,
        mood: null,
        top_expense: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test scaffolding
      }) as any
    const out = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        // Día 2 del ciclo: entró apenas el 20% del histórico — con la
        // semántica vieja esto emitía "tu ingreso bajó $400k" casi todo
        // el ciclo. Los cierres son estables → sin señal.
        ingresoRecurrente: 100_000,
        ingresoMes: 100_000,
        summaries: [summary(500_000, 1), summary(500_000, 2), summary(500_000, 3)],
      }),
    )
    expect(out.find((s) => s.id === 'income-volatility')).toBeUndefined()
  })

  it('fijos-ratio dinámico usa el copy neutral (sin "sueldo")', () => {
    const out = buildControlSignals(
      baseArgs({
        incomeMode: 'dynamic',
        ingresoMes: 500_000,
        ingresoRecurrente: 500_000,
        fijosMes: 400_000, // ratio 0.8 → dispara
      }),
    )
    const ratio = out.find((s) => s.id === 'fijos-ratio')
    expect(ratio).toBeDefined()
    expect(ratio?.body).not.toMatch(/sueldo/i)
  })

  it('payday-proximity dinámico: mismo id (dismiss estable), copy de fin de ciclo', () => {
    const args = baseArgs({
      incomeMode: 'dynamic',
      ingresoMes: 300_000,
      ingresoRecurrente: 300_000,
      diasRestantes: 5,
      cupoDiario: 20_000,
    })
    // restanteMes bajo → sustainable < 70% del cupo → dispara.
    args.view = { ...args.view, restanteMes: 30_000 }
    const out = buildControlSignals(args)
    const payday = out.find((s) => s.id === 'payday-proximity')
    expect(payday).toBeDefined()
    expect(payday?.bubbleFrame).toBe('cycle')
    expect(`${payday?.title} ${payday?.body}`).not.toMatch(/cobro|sueldo/i)

    // Fixed conserva el marco de cobro (regresión).
    const fixedArgs = baseArgs({
      diasRestantes: 5,
      cupoDiario: 20_000,
    })
    fixedArgs.view = { ...fixedArgs.view, restanteMes: 30_000 }
    const fixedOut = buildControlSignals(fixedArgs)
    const fixedPayday = fixedOut.find((s) => s.id === 'payday-proximity')
    expect(fixedPayday).toBeDefined()
    expect(fixedPayday?.bubbleFrame).toBe('payday')
  })
})
