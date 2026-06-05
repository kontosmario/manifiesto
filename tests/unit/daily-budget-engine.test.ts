import { describe, expect, it } from 'vitest'
import { computeDailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { Expense } from '@/features/expenses/use-expenses'
import type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'

function buildAccounting(
  startIso: string,
  endIso: string,
  days: number,
  todayIso: string,
): MonthlyAccountingWindow {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const today = new Date(todayIso)
  const msPerDay = 86_400_000
  const daysIntoMonth = Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1
  const daysRemaining = Math.max(1, Math.ceil((end.getTime() - today.getTime()) / msPerDay))
  return { start, end, days, today, daysIntoMonth, daysRemaining }
}

function buildExpense(createdAt: string, price: number): Expense {
  return {
    category_id: 'cat-1',
    commitment_id: null,
    created_at: createdAt,
    created_by: 'user-1',
    creator_display_name: 'Mario',
    description: 'Compra',
    family_id: 'family-1',
    id: `${createdAt}-${price}`,
    price,
  }
}

describe('computeDailyBudgetSummary', () => {
  it('marca el día como excedido cuando el gasto supera la apertura', () => {
    const summary = computeDailyBudgetSummary({
      bufferMode: 'none',
      bufferValue: 0,
      expenses: [buildExpense('2026-04-01T12:00:00.000Z', 50_000)],
      fixedExpensesMonthlyTotal: 0,
      monthlyIncome: 30_000,
      monthlyAccounting: buildAccounting(
        '2026-04-01T00:00:00.000Z',
        '2026-04-11T00:00:00.000Z',
        10,
        '2026-04-01T15:00:00.000Z',
      ),
      savingsGoal: 0,
      today: new Date('2026-04-01T15:00:00.000Z'),
    })

    expect(summary.status).toBe('exceeded')
    expect(summary.remainingToday).toBeLessThan(0)
    expect(summary.todaySpent).toBe(50_000)
    expect(summary.suggestions[0]?.tone).toBe('warning')
  })

  it('reserva colchón fijo y mantiene sugerencia positiva en un día sin gasto', () => {
    const summary = computeDailyBudgetSummary({
      bufferMode: 'fixed',
      bufferValue: 10_000,
      expenses: [],
      fixedExpensesMonthlyTotal: 20_000,
      monthlyIncome: 120_000,
      monthlyAccounting: buildAccounting(
        '2026-04-01T00:00:00.000Z',
        '2026-05-01T00:00:00.000Z',
        30,
        '2026-04-04T10:00:00.000Z',
      ),
      savingsGoal: 20_000,
      today: new Date('2026-04-04T10:00:00.000Z'),
    })

    expect(summary.bufferReserve).toBe(10_000)
    expect(summary.bufferRemaining).toBe(10_000)
    expect(summary.status).toBe('positive')
    expect(summary.zeroSpendStreak).toBeGreaterThan(0)
    expect(summary.suggestions.some((entry) => entry.tone === 'success')).toBe(true)
  })
})
