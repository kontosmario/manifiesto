import { describe, expect, it } from 'vitest'
import { buildControlDataFromSnapshot } from '@/features/insights/control-v2-adapter'
import { computeControlView } from '@/features/insights/control-v2-mock'
import type { Expense } from '@/features/expenses/expense-repository'
import type { FamilyFinance } from '@/features/finance/use-family-finance'
import type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'
import type { PayCycle } from '@/utils/pay-cycle'

// Regresión: con override de saldo, el Control debe COINCIDIR con el Home.
// · cupoDiario resta el variable ya gastado = (libreMes − gastado) / días
//   restantes (= saldo del Home / días restantes). Antes daba libreMes/días
//   restantes, re-ofreciendo plata ya gastada (kontosmario: 282.908 vs 187.631).
// · restanteMes ("te queda") = libreMes − gastado = el saldo real. Antes se
//   derivaba de cupoDiario × diasMes, que con override inflaba el número.

const NOW = new Date(2026, 5, 20, 15, 0, 0, 0) // 20 jun 2026 (día 20 de 30)

function build() {
  const finance: FamilyFinance = {
    source: 'supabase',
    daily_budget_buffer_mode: 'none',
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: 9,
    daily_budget_nudges_enabled: true,
    monthly_income: 6_000_000,
    savings_goal: 0,
    savings_goal_percent: 0,
    usd_exchange_rate: 1000,
    salary_payment_day: 1,
    last_salary_confirmed_at: null,
    current_cycle_starting_balance: 6_500_000, // override activo
    current_cycle_anchor: '2026-06-01', // = formatLocalDateKey(payCycle.start)
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
    daysIntoMonth: 20,
    daysRemaining: 11,
  }
  // 1M discrecional, el 10/6 (día cerrado del ciclo).
  const expenses = [
    {
      id: 'e1',
      family_id: 'f1',
      created_at: new Date(2026, 5, 10, 12, 0, 0, 0).toISOString(),
      price: 1_000_000,
      commitment_id: null,
      category_id: null,
    },
  ] as unknown as Expense[]
  return buildControlDataFromSnapshot({
    expenses,
    fixedExpenses: [],
    finance,
    summaries: [],
    payCycle,
    monthlyAccounting,
    now: NOW,
  })
}

describe('Control con override: cupo + restanteMes coinciden con el saldo del Home', () => {
  it('cupoDiario resta el variable ya gastado: (libreMes − gastado) / días restantes', () => {
    const data = build()
    expect(data.libreMes).toBe(6_500_000) // override − 0 fijos − 0 ahorro
    // (6.5M − 1M gastado) / 11 días restantes = 500.000.
    // Sin el fix: 6.5M / 11 = 590.909 (re-ofrecía el 1M ya gastado).
    expect(data.cupoDiario).toBe(500_000)
  })

  it('restanteMes ("te queda") = libreMes − gastado = saldo real', () => {
    const view = computeControlView(build())
    // 6.5M − 1M = 5.5M. Sin el fix, libreMesTotal = cupoDiario(590.909) × 30
    // → restanteMes ≈ 16,7M inflado.
    expect(view.restanteMes).toBe(5_500_000)
  })
})
