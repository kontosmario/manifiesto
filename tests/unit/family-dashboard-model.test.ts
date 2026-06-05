import { describe, expect, it } from 'vitest'
import {
  buildFamilyDashboardSnapshot,
  type FamilyDashboardFinanceSnapshot,
} from '@/features/family/family-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { formatLocalDateKey } from '@/utils/pay-cycle'

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    category_id: 'cat-1',
    commitment_id: null,
    created_at: '2026-04-10T12:00:00.000Z',
    created_by: 'user-1',
    creator_display_name: 'Mario',
    description: 'Compra',
    family_id: 'family-1',
    id: 'expense-1',
    price: 1_000,
    ...overrides,
  }
}

function buildFixedExpense(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return {
    amount: 10_000,
    category_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ends_on: null,
    family_id: 'family-1',
    frequency: 'monthly',
    id: 'commitment-1',
    installments_paid: 0,
    installments_total: null,
    kind: 'recurring',
    last_paid_at: null,
    lender_name: null,
    name: 'Alquiler',
    next_due_on: '2026-04-25',
    notes: null,
    remaining_balance: null,
    status: 'active',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildFinance(
  overrides: Partial<FamilyDashboardFinanceSnapshot> = {},
): FamilyDashboardFinanceSnapshot {
  return {
    daily_budget_buffer_mode: 'none',
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: 9,
    daily_budget_nudges_enabled: true,
    last_salary_confirmed_at: '2026-04-01T10:00:00.000Z',
    monthly_income: 100_000,
    salary_payment_day: 1,
    savings_goal: 10_000,
    savings_goal_percent: 10,
    usd_exchange_rate: 1_000,
    ...overrides,
  }
}

describe('buildFamilyDashboardSnapshot', () => {
  it('deriva balance, presión fija e histórico mensual desde una sola colección de gastos', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      commitments: [buildFixedExpense()],
      expenses: [
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-variable', price: 15_000 }),
        buildExpense({
          commitment_id: 'commitment-1',
          created_at: '2026-04-12T12:00:00.000Z',
          id: 'expense-commitment',
          price: 5_000,
        }),
        buildExpense({ created_at: '2026-03-08T12:00:00.000Z', id: 'expense-march', price: 20_000 }),
      ],
      finance: buildFinance(),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.totalGeneral).toBe(40_000)
    expect(snapshot.actualSpentInCurrentCycle).toBe(20_000)
    expect(snapshot.variableSpentInCurrentCycle).toBe(15_000)
    expect(snapshot.commitmentPaymentsInCurrentCycle).toBe(5_000)
    expect(snapshot.commitmentPressureInCurrentCycle).toBe(10_000)
    expect(snapshot.totalAvailable).toBe(65_000)
    expect(snapshot.savingsGoalPercent).toBe(10)
    expect(snapshot.targetEssentialsPercent).toBe(50)
    expect(snapshot.targetFlexiblePercent).toBe(40)
    expect(snapshot.flexibleTargetAmount).toBe(40_000)
    expect(snapshot.flexibleDelta).toBe(-25_000)
    expect(snapshot.flexibleRemaining).toBe(25_000)
    expect(snapshot.monthlyHistory[0]?.spent).toBe(20_000)
    expect(snapshot.monthlyHistory[1]?.spent).toBe(20_000)
    expect(snapshot.monthlyHistoryTotals.totalSpent).toBe(40_000)
  })

  it('congela el ciclo cuando falta confirmar el cobro del mes actual', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-03-20T12:00:00.000Z', id: 'expense-march', price: 8_000 }),
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-april', price: 12_000 }),
      ],
      finance: buildFinance({
        last_salary_confirmed_at: '2026-03-02T10:00:00.000Z',
      }),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.isSalaryPendingConfirmation).toBe(true)
    // Refactor: cycle anchor now starts on the salary day itself (inclusive) instead of day-after.
    expect(formatLocalDateKey(snapshot.payCycle.start)).toBe('2026-03-01')
    expect(formatLocalDateKey(snapshot.payCycle.end)).toBe('2026-04-01')
    // Spec A.5 reframe: `spentInCurrentCycle` ahora vive sobre la ventana
    // mensual de accounting (que NO se congela cuando falta confirmar el
    // sueldo — el plano mensual sigue su curso). Para monthly users, la
    // ventana es el mes actual (abril), no el cycle congelado (marzo).
    // Por eso registramos los $12.000 de abril, no los $8.000 de marzo.
    expect(snapshot.spentInCurrentCycle).toBe(12_000)
    expect(snapshot.remainingUntilPayday).toBeLessThan(0)
  })

  it('detecta cuando el gasto flexible ya superó el objetivo configurado', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-1', price: 18_000 }),
        buildExpense({ created_at: '2026-04-12T12:00:00.000Z', id: 'expense-2', price: 17_000 }),
      ],
      finance: buildFinance({
        monthly_income: 100_000,
        savings_goal: 25_000,
        savings_goal_percent: 25,
      }),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.targetFlexiblePercent).toBe(25)
    expect(snapshot.flexibleTargetAmount).toBe(25_000)
    expect(snapshot.flexibleDelta).toBe(10_000)
    expect(snapshot.flexibleRemaining).toBe(0)
  })
})
