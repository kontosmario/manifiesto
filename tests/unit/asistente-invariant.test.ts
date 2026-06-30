import { describe, expect, it } from 'vitest'

import {
  buildControlSignals,
  type CategoryLimit,
  type NotificationLite,
  type VelocitySnapshot,
} from '@/features/insights/control-signals'
import { CONTROL_MOCK, computeControlView } from '@/features/insights/control-v2-mock'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'

/**
 * INVARIANTE DEL ASISTENTE: "dato válido o ausente, nunca errático".
 *
 * El asistente es 100% determinístico. La única forma de mostrar basura es
 * propagar NaN/Infinity/undefined o dividir por algo inválido. Este test
 * envenena TODAS las formas de dato posibles y exige que NINGUNA señal que
 * llegue al usuario tenga confidence/impactRaw no-finito ni texto con
 * "NaN"/"Infinity"/"undefined". Cubre los 28 builders de una sola pasada.
 */

const NOW = new Date('2026-04-22T14:20:00')

type Args = Parameters<typeof buildControlSignals>[0]

function baseArgs(overrides: Partial<Args> = {}): Args {
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

/** Override de la ControlView envenenando campos numéricos. */
function withView(overrides: Record<string, unknown>): Partial<Args> {
  const view = computeControlView(CONTROL_MOCK)
  return { view: { ...view, ...overrides } as Args['view'] }
}

const BAD = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

/** Corre el builder y exige el invariante sobre cada señal devuelta. */
function assertClean(args: Args, label: string): void {
  const out = buildControlSignals(args)
  for (const t of out) {
    expect(Number.isFinite(t.confidence), `${label} · confidence finita en ${t.id} (=${t.confidence})`).toBe(true)
    expect(Number.isFinite(t.impactRaw), `${label} · impactRaw finito en ${t.id} (=${t.impactRaw})`).toBe(true)
    const text = `${t.title} ?? ${t.body} ?? ${t.impact} ?? ${t.cat}`
    expect(/NaN|Infinity|undefined/.test(text), `${label} · texto errático en ${t.id}: ${text}`).toBe(false)
  }
}

describe('asistente — invariante "dato válido o ausente, nunca errático"', () => {
  it('data válida produce señales limpias (sanity)', () => {
    assertClean(baseArgs(), 'baseline')
  })

  it('campos numéricos de la ControlView envenenados (NaN/±Infinity/negativos)', () => {
    const fields = [
      'promedioDiario',
      'restanteMes',
      'libreHoy',
      'sobrantePresupuestadoMes',
      'vault',
      'globalAvg',
      'racha',
      'cupoDiario',
    ]
    for (const field of fields) {
      for (const bad of [...BAD, -50_000, 0]) {
        assertClean(baseArgs(withView({ [field]: bad })), `view.${field}=${bad}`)
      }
    }
  })

  it('args de presupuesto/ingreso envenenados', () => {
    for (const bad of [...BAD, 0, -1000]) {
      assertClean(baseArgs({ cupoDiario: bad }), `cupoDiario=${bad}`)
      assertClean(baseArgs({ ingresoMes: bad }), `ingresoMes=${bad}`)
      assertClean(baseArgs({ fijosMes: bad }), `fijosMes=${bad}`)
      assertClean(baseArgs({ diasRestantes: bad }), `diasRestantes=${bad}`)
    }
  })

  it('expenses con price NaN/negativo/null y created_at inválido', () => {
    const poisonExpenses = [
      { id: '1', description: 'X', price: Number.NaN, category_id: 'c1', created_at: '2026-04-22T23:30:00', commitment_id: null },
      { id: '2', description: 'X', price: -5000, category_id: 'c1', created_at: 'no-es-fecha', commitment_id: null },
      { id: '3', description: 'X', price: Number.POSITIVE_INFINITY, category_id: 'c1', created_at: '2026-04-22T01:00:00', commitment_id: null },
      { id: '4', description: 'X', price: null, category_id: 'c1', created_at: '2026-04-22T23:59:00', commitment_id: null },
      { id: '5', description: 'X', price: 3000, category_id: 'c1', created_at: '2026-13-99T99:99:99', commitment_id: null },
    ]
    // 15 copias para superar los umbrales de count (small-leaks/night-impulse).
    const many = Array.from({ length: 15 }, (_, i) => ({ ...poisonExpenses[i % 5], id: `e${i}` }))
    assertClean(baseArgs({ expenses: many as never }), 'expenses envenenados')
  })

  it('summaries con totales/income NaN', () => {
    const summaries = [
      { period_start: '2026-03-01', monthly_income: Number.NaN, total_variable_spent: 100, category_breakdown: [{ name: 'Comida', total: Number.NaN }] },
      { period_start: '2026-02-01', monthly_income: Number.POSITIVE_INFINITY, total_variable_spent: 100, category_breakdown: { Comida: { amount: undefined } } },
    ]
    assertClean(baseArgs({ summaries: summaries as never, expenses: [{ id: '1', description: 'X', price: 9000, category_id: 'c1', created_at: '2026-04-22T12:00:00', commitment_id: null }] as never, categoriesExpense: [{ id: 'c1', name: 'Comida', displayName: 'Comida' }] as never }), 'summaries NaN')
  })

  it('velocity con forecast/momentum no finitos', () => {
    for (const bad of BAD) {
      const velocity = { snapshot_date: '2026-04-22', avg_daily_last_7: bad, avg_daily_last_30: bad, momentum: bad, forecast_close_amount: bad, stress_level: 'warn' } as VelocitySnapshot
      assertClean(baseArgs({ velocity }), `velocity bad=${bad}`)
    }
  })

  it('savingsGoal con montos NaN/Infinity', () => {
    for (const bad of BAD) {
      const savingsGoal = { id: 'g', title: 'Meta', isActive: true, goalAmount: bad, currentAmount: bad, targetMonths: 6 }
      assertClean(baseArgs({ savingsGoal: savingsGoal as never }), `savingsGoal bad=${bad}`)
    }
  })

  it('forecast pesimista con dailyAvg/totalProjected no finitos', () => {
    for (const bad of BAD) {
      const forecast = {
        pessimistic: { dailyAvg: bad, totalProjected: bad, endingBalance: bad, track: [] },
        baseline: { dailyAvg: bad, totalProjected: bad, endingBalance: bad, track: [] },
        optimistic: { dailyAvg: bad, totalProjected: bad, endingBalance: bad, track: [] },
        inflectionDays: [],
      }
      assertClean(baseArgs({ forecast: forecast as never }), `forecast bad=${bad}`)
    }
  })

  it('limits con cap<=0 y threshold fuera de rango', () => {
    const limits = [
      { id: 'l1', category_id: 'c1', monthly_cap: 0, warning_threshold_pct: 80 },
      { id: 'l2', category_id: 'c1', monthly_cap: -100, warning_threshold_pct: 150 },
      { id: 'l3', category_id: 'c1', monthly_cap: Number.NaN, warning_threshold_pct: -10 },
    ] as CategoryLimit[]
    const expenses = [{ id: '1', description: 'X', price: 9000, category_id: 'c1', created_at: '2026-04-22T12:00:00', commitment_id: null }]
    assertClean(baseArgs({ limits, expenses: expenses as never }), 'limits inválidos')
  })

  it('price_hike notifications con metadata corrupta', () => {
    const notifications = [
      { id: 'n1', kind: 'price_hike', severity: 'warning', created_at: '2026-04-21T10:00:00', metadata: { name: 'Netflix', previous_amount: 0, new_amount: 5000, delta_pct: 'Infinity', fixed_expense_id: 'f1' } },
      { id: 'n2', kind: 'price_hike', severity: 'warning', created_at: '2026-04-21T10:00:00', metadata: { name: 'Spotify', previous_amount: '$3000', new_amount: 'no-numero', delta_pct: undefined, fixed_expense_id: 'f2' } },
    ] as NotificationLite[]
    assertClean(baseArgs({ notifications }), 'price_hike corrupto')
  })

  it('TODO envenenado a la vez (peor caso combinado)', () => {
    assertClean(
      baseArgs({
        ...withView({
          promedioDiario: Number.NaN,
          restanteMes: Number.NEGATIVE_INFINITY,
          libreHoy: Number.NaN,
          sobrantePresupuestadoMes: Number.POSITIVE_INFINITY,
          vault: Number.NaN,
          globalAvg: Number.NaN,
        }),
        cupoDiario: 0,
        ingresoMes: Number.NaN,
        fijosMes: Number.POSITIVE_INFINITY,
        diasRestantes: Number.NaN,
        velocity: { snapshot_date: '2026-04-22', avg_daily_last_7: Number.NaN, avg_daily_last_30: Number.NaN, momentum: Number.NaN, forecast_close_amount: Number.NaN, stress_level: 'critical' } as VelocitySnapshot,
        savingsGoal: { id: 'g', title: 'Meta', isActive: true, goalAmount: Number.NaN, currentAmount: Number.POSITIVE_INFINITY, targetMonths: 6 } as never,
      }),
      'todo envenenado',
    )
  })
})
