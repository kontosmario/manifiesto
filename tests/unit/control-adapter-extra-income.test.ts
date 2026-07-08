import { describe, expect, it } from 'vitest'
import { buildControlDataFromSnapshot } from '@/features/insights/control-v2-adapter'
import type { FamilyFinance } from '@/features/finance/use-family-finance'
import type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'
import type { PayCycle } from '@/utils/pay-cycle'

// Regresión de la auditoría 2026-06-11 (parte 2): Home sumaba los
// income_events del ciclo al disponible pero Control los ignoraba —
// una transferencia de $640k real no movía ni el cupo ni la
// proyección. El adapter ahora recibe `extraIncome` y lo suma al
// ingreso efectivo (espejo de `effectiveCycleIncome + cycleExtraIncome`
// en use-home-metrics).

const NOW = new Date(2026, 5, 11, 15, 0, 0, 0) // 11 jun 2026

function fixtures() {
  const finance: FamilyFinance = {
    source: 'supabase',
    daily_budget_buffer_mode: 'none',
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: 9,
    daily_budget_nudges_enabled: true,
    monthly_income: 1_000_000,
    savings_goal: 0,
    savings_goal_percent: 0,
    usd_exchange_rate: 1000,
    salary_payment_day: 1,
    last_salary_confirmed_at: null,
    current_cycle_starting_balance: null,
    current_cycle_anchor: null,
    cycle_type: 'monthly',
    cycle_anchor_date: null,
    cycle_length_days: null,
    monthly_reserve_amount: 0,
  }
  const payCycle: PayCycle = {
    start: new Date(2026, 5, 1),
    end: new Date(2026, 6, 1),
    weeks: 5,
    days: 30,
  }
  const monthlyAccounting: MonthlyAccountingWindow = {
    start: new Date(2026, 5, 1),
    end: new Date(2026, 6, 1),
    days: 30,
    today: NOW,
    daysIntoMonth: 11,
    daysRemaining: 20,
  }
  return { finance, payCycle, monthlyAccounting }
}

function build(extraIncome?: number) {
  const { finance, payCycle, monthlyAccounting } = fixtures()
  return buildControlDataFromSnapshot({
    expenses: [],
    fixedExpenses: [],
    finance,
    summaries: [],
    payCycle,
    monthlyAccounting,
    extraIncome,
    now: NOW,
  })
}

describe('adapter de Control: ingresos extra del ciclo (auditoría 2026-06-11)', () => {
  it('suma extraIncome al ingreso efectivo del ciclo', () => {
    const sinExtra = build(0)
    const conExtra = build(640_000)
    expect(conExtra.ingresoMes - sinExtra.ingresoMes).toBe(640_000)
  })

  it('el cupo diario sube en extraIncome / diasMes (paridad con Home)', () => {
    const sinExtra = build(0)
    const conExtra = build(640_000)
    // Sin fijos ni ahorro: libre = ingreso, cupo = libre / 30.
    expect(conExtra.cupoDiario - sinExtra.cupoDiario).toBeCloseTo(
      640_000 / 30,
      6,
    )
  })

  it('default (sin arg) y valores negativos no alteran el cupo', () => {
    const base = build(undefined)
    const negativo = build(-50_000)
    expect(base.ingresoMes).toBe(1_000_000)
    expect(negativo.ingresoMes).toBe(1_000_000)
  })
})

describe('adapter de Control: modo INGRESO DINÁMICO', () => {
  function buildDynamic(extraIncome: number) {
    const { finance, payCycle, monthlyAccounting } = fixtures()
    return buildControlDataFromSnapshot({
      expenses: [],
      fixedExpenses: [],
      finance: { ...finance, monthly_income: 0, income_mode: 'dynamic' },
      summaries: [],
      payCycle,
      monthlyAccounting,
      extraIncome,
      now: NOW,
    })
  }

  it('el ingreso del ciclo = Σ income_events (sin sueldo base)', () => {
    expect(buildDynamic(500_000).ingresoMes).toBe(500_000)
    expect(buildDynamic(0).ingresoMes).toBe(0)
  })

  it('el cupo reparte sobre los días RESTANTES (paridad con Home), no el mes completo', () => {
    // Home trata dinámico como override: discrecional / días restantes.
    // Sin fijos/ahorro/gasto: 500.000 / 20 (no / 30).
    const d = buildDynamic(500_000)
    expect(d.cupoDiario).toBeCloseTo(500_000 / 20, 6)
  })

  it('fixed no cambia de comportamiento (regresión: mes completo)', () => {
    const { finance, payCycle, monthlyAccounting } = fixtures()
    const fixed = buildControlDataFromSnapshot({
      expenses: [],
      fixedExpenses: [],
      finance: { ...finance, income_mode: 'fixed' },
      summaries: [],
      payCycle,
      monthlyAccounting,
      extraIncome: 0,
      now: NOW,
    })
    expect(fixed.cupoDiario).toBeCloseTo(1_000_000 / 30, 6)
  })
})
