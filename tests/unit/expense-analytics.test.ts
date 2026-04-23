import { describe, expect, it } from 'vitest'
import { computeExpenseAnalytics } from '@/features/expenses/expense-analytics'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

const categories: Category[] = [
  {
    color: '#22c55e',
    family_id: 'family-1',
    icon: 'restaurant',
    id: 'food',
    name: 'Comida',
  },
  {
    color: '#38bdf8',
    family_id: 'family-1',
    icon: 'commute',
    id: 'transport',
    name: 'Transporte',
  },
]

function buildExpense(overrides: Partial<Expense>): Expense {
  return {
    category_id: 'food',
    commitment_id: null,
    created_at: '2026-04-20T12:00:00.000Z',
    description: 'Compra',
    family_id: 'family-1',
    id: `expense-${Math.random()}`,
    member_id: 'member-1',
    price: 1000,
    ...overrides,
  }
}

describe('computeExpenseAnalytics', () => {
  it('detecta categoría líder, gasto repetido y presión del fin de semana', () => {
    const expenses: Expense[] = [
      buildExpense({ id: 'e1', created_at: '2026-04-05T12:00:00.000Z', description: 'Delivery', price: 15000 }),
      buildExpense({ id: 'e2', created_at: '2026-04-06T12:00:00.000Z', description: 'Delivery', price: 14000 }),
      buildExpense({ id: 'e3', created_at: '2026-04-12T12:00:00.000Z', description: 'Delivery', price: 13000 }),
      buildExpense({ id: 'e4', created_at: '2026-04-18T12:00:00.000Z', description: 'Supermercado', price: 18000 }),
      buildExpense({ id: 'e5', category_id: 'transport', created_at: '2026-04-14T12:00:00.000Z', description: 'Taxi', price: 2500 }),
      buildExpense({ id: 'e6', category_id: 'transport', created_at: '2026-04-15T12:00:00.000Z', description: 'Colectivo', price: 1500 }),
    ]

    const summary = computeExpenseAnalytics({
      categories,
      expenses,
      payCycle: {
        start: new Date('2026-04-01T12:00:00.000Z'),
        end: new Date('2026-05-01T12:00:00.000Z'),
      },
      spentInCurrentCycle: expenses.reduce((sum, expense) => sum + expense.price, 0),
      today: new Date('2026-04-20T12:00:00.000Z'),
      totalAvailable: 150000,
    })

    expect(summary.topCategory?.label).toBe('Comida')
    expect(summary.topCategory?.share).toBeGreaterThan(0.8)
    expect(summary.recurringFocus).toEqual({
      count: 3,
      label: 'Delivery',
      total: 42000,
    })
    expect(summary.weekendPremiumRatio).toBeGreaterThan(1.25)
    expect(summary.suggestions).toHaveLength(3)
    expect(summary.suggestions.some((item) => item.title === 'Hay un gasto repetido para auditar')).toBe(true)
    expect(summary.forecastSeries.length).toBeGreaterThan(0)
  })

  it('marca atención cuando la proyección cierra en negativo', () => {
    const expenses: Expense[] = [
      buildExpense({ id: 'e1', created_at: '2026-04-14T12:00:00.000Z', description: 'Comida', price: 22000 }),
      buildExpense({ id: 'e2', created_at: '2026-04-16T12:00:00.000Z', description: 'Comida', price: 18000 }),
      buildExpense({ id: 'e3', created_at: '2026-04-18T12:00:00.000Z', description: 'Comida', price: 20000 }),
      buildExpense({ id: 'e4', created_at: '2026-04-20T12:00:00.000Z', description: 'Comida', price: 24000 }),
    ]

    const summary = computeExpenseAnalytics({
      categories,
      expenses,
      payCycle: {
        start: new Date('2026-04-01T12:00:00.000Z'),
        end: new Date('2026-05-01T12:00:00.000Z'),
      },
      spentInCurrentCycle: expenses.reduce((sum, expense) => sum + expense.price, 0),
      today: new Date('2026-04-20T12:00:00.000Z'),
      totalAvailable: 12000,
    })

    expect(summary.needsAttention).toBe(true)
    expect(summary.projectedAvailableAtCycleEnd).toBeLessThan(0)
    expect(summary.adjustmentNeededPerDay).toBeGreaterThan(0)
    expect(summary.suggestions[0]?.title).toBe('Riesgo de pasarte antes del próximo cobro')
  })
})
