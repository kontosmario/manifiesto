import { describe, it, expect } from 'vitest'
import {
  summarizeFijos,
  groupFijosByCategory,
  type FijoItem,
} from '@/features/fijos/fijos-aggregates.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'

function makeFixed(over: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: 'fx-1',
    family_id: 'fam-1',
    name: 'Netflix',
    amount: 5000,
    kind: 'recurring',
    status: 'active',
    frequency: 'monthly',
    category_id: 'cat-entret',
    next_due_on: '2026-06-15',
    day_of_month: 15,
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
    ...over,
  }
}

const TODAY = new Date('2026-06-08T12:00:00')
const MONTHLY_START = new Date('2026-06-01T00:00:00')
const MONTHLY_END = new Date('2026-07-01T00:00:00')
const MONTHLY_DAYS = 30

describe('summarizeFijos — empty input', () => {
  it('devuelve summary vacío con totales 0', () => {
    const summary = summarizeFijos({
      items: [],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.total).toBe(0)
    expect(summary.paidAmount).toBe(0)
    expect(summary.pendingAmount).toBe(0)
    expect(summary.overdueAmount).toBe(0)
    expect(summary.paidItems).toEqual([])
    expect(summary.pendingItems).toEqual([])
    expect(summary.overdueItems).toEqual([])
    expect(summary.futureItems).toEqual([])
    expect(summary.upcoming).toEqual([])
    expect(summary.hikes).toEqual([])
    expect(summary.daysToNextPayment).toBeNull()
  })
})

describe('summarizeFijos — status classification', () => {
  it('next_due_on > today + en cycle → pending', () => {
    const item = makeFixed({ next_due_on: '2026-06-20' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems).toHaveLength(1)
    expect(s.pendingItems[0]!.computedStatus).toBe('pending')
  })

  it('next_due_on < today (mismo ciclo o anterior) sin pago → overdue', () => {
    const item = makeFixed({ next_due_on: '2026-06-03' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems).toHaveLength(1)
    expect(s.overdueItems[0]!.computedStatus).toBe('overdue')
  })

  it('next_due_on >= cycleEnd y last_paid_at null → future', () => {
    const item = makeFixed({
      next_due_on: '2026-08-15',
      last_paid_at: null,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.futureItems).toHaveLength(1)
    expect(s.futureItems[0]!.computedStatus).toBe('future')
  })

  it('next_due_on >= cycleEnd y last_paid_at set → paid (cycle covered)', () => {
    const item = makeFixed({
      next_due_on: '2026-08-15',
      last_paid_at: '2026-05-20T10:00:00Z',
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.paidItems).toHaveLength(1)
    expect(s.paidItems[0]!.computedStatus).toBe('paid')
  })

  it('payment del cycle → paid (override de cualquier next_due_on)', () => {
    const item = makeFixed({ id: 'fx-pago', next_due_on: '2026-06-03' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-pago',
          paidAt: '2026-06-04T10:00:00Z',
          periodMonth: '2026-06-01',
        } as any,
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.paidItems).toHaveLength(1)
    expect(s.paidItems[0]!.paidPaymentId).toBe('pay-1')
  })

  it('payment optimista → paid pero paidPaymentId null (no revertible aún)', () => {
    // Durante la ventana optimista el payment.id es `optimistic-<iso>-<fx>`,
    // que NO debe ofrecerse como revertible (22P02 contra la RPC uuid).
    const item = makeFixed({ id: 'fx-opt', next_due_on: '2026-06-03' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [
        {
          id: 'optimistic-2026-06-04T10:00:00Z-fx-opt',
          fixedExpenseId: 'fx-opt',
          paidAt: '2026-06-04T10:00:00Z',
          periodMonth: '2026-06-01',
        } as any,
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.paidItems).toHaveLength(1)
    expect(s.paidItems[0]!.computedStatus).toBe('paid')
    expect(s.paidItems[0]!.paidPaymentId).toBeNull()
  })
})

describe('summarizeFijos — totals & percentages', () => {
  it('total excluye future items', () => {
    const items = [
      makeFixed({ id: 'a', amount: 100, next_due_on: '2026-06-15' }), // pending
      makeFixed({ id: 'b', amount: 200, next_due_on: '2026-08-15', last_paid_at: null }), // future
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.total).toBe(100)
    expect(s.futureItems).toHaveLength(1)
  })

  it('paidPct/pendingPct/overduePct enteros sumando ~100 sobre el ciclo activo', () => {
    const items = [
      makeFixed({ id: 'a', amount: 100, next_due_on: '2026-06-15' }), // pending
      makeFixed({ id: 'b', amount: 100, next_due_on: '2026-06-03' }), // overdue
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.total).toBe(200)
    expect(s.pendingPct + s.overduePct).toBe(100)
    expect(s.paidPct).toBe(0)
  })
})

describe('summarizeFijos — upcoming + daysToNextPayment', () => {
  it('upcoming retorna hasta 3 ordenados por daysUntilDue', () => {
    const items = [
      makeFixed({ id: 'a', amount: 1, next_due_on: '2026-06-25', day_of_month: 25 }),
      makeFixed({ id: 'b', amount: 1, next_due_on: '2026-06-10', day_of_month: 10 }),
      makeFixed({ id: 'c', amount: 1, next_due_on: '2026-06-15', day_of_month: 15 }),
      makeFixed({ id: 'd', amount: 1, next_due_on: '2026-06-28', day_of_month: 28 }),
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.upcoming).toHaveLength(3)
    expect(s.upcoming[0]!.id).toBe('b')
  })

  it('daysToNextPayment refleja el primer upcoming', () => {
    const items = [
      makeFixed({ id: 'a', next_due_on: '2026-06-10', day_of_month: 10 }),
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.daysToNextPayment).toBe(2) // 10 - 8
  })
})

describe('summarizeFijos — completed/archived no aparecen', () => {
  it('filtra items con status=completed o archived', () => {
    const items = [
      makeFixed({ id: 'a', status: 'completed', next_due_on: '2026-06-15' }),
      makeFixed({ id: 'b', status: 'archived', next_due_on: '2026-06-15' }),
      makeFixed({ id: 'c', status: 'paused', next_due_on: '2026-06-15' }),
      makeFixed({ id: 'd', status: 'active', next_due_on: '2026-06-15' }),
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    // active + paused se procesan
    const all = [...s.paidItems, ...s.pendingItems, ...s.overdueItems, ...s.futureItems]
    expect(all.map((i) => i.id).sort()).toEqual(['c', 'd'])
  })
})

describe('summarizeFijos — pctOfIncome', () => {
  it('pctOfIncome null si monthlyIncome=0', () => {
    const item = makeFixed({ amount: 5000, frequency: 'monthly' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems[0]!.pctOfIncome).toBeNull()
  })

  it('pctOfIncome calcula bien con sueldo (monthly recurring)', () => {
    const item = makeFixed({ amount: 10_000, frequency: 'monthly' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
      monthlyIncome: 100_000,
    })
    // 10k / 100k = 10%
    expect(s.pendingItems[0]!.pctOfIncome).toBe(10)
  })
})

describe('summarizeFijos — annualCost', () => {
  it('monthly recurring → amount × 12', () => {
    const item = makeFixed({ amount: 5000, frequency: 'monthly' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems[0]!.annualCost).toBe(60_000)
  })

  it('annual recurring → amount × 1', () => {
    const item = makeFixed({ amount: 100_000, frequency: 'annual' })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems[0]!.annualCost).toBe(100_000)
  })

  it('installment → amount × installments_total', () => {
    const item = makeFixed({
      kind: 'installment',
      amount: 5000,
      installments_total: 12,
      frequency: 'monthly',
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems[0]!.annualCost).toBe(60_000)
  })

  it('debt → remaining_balance', () => {
    const item = makeFixed({
      kind: 'debt',
      amount: 1000,
      remaining_balance: 80_000,
      frequency: 'monthly',
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.pendingItems[0]!.annualCost).toBe(80_000)
  })
})

describe('groupFijosByCategory', () => {
  function makeFijo(over: Partial<FijoItem> = {}): FijoItem {
    const base = makeFixed()
    return {
      ...base,
      dayOfMonth: over.dayOfMonth ?? base.day_of_month,
      computedStatus: 'pending',
      daysUntilDue: 7,
      isZombie: false,
      daysSinceLastPaid: null,
      priceHistory: [],
      trendDeltaPct: null,
      trendPrevAmount: null,
      arrearsOnLastPayment: false,
      paidPaymentId: null,
      cuotaMonth: '2026-06-01',
      annualCost: 60_000,
      pctOfIncome: null,
      paymentsLifetime: 0,
      totalPaidLifetime: 0,
      ...over,
    }
  }

  it('agrupa por category_id y ordena los grupos por vencimiento más próximo (no por total)', () => {
    const items = [
      // cat-A: barata pero vence ANTES → debe ir primero.
      makeFijo({ id: 'a', category_id: 'cat-A', amount: 1000, next_due_on: '2026-06-08' }),
      // cat-B: cara pero vence DESPUÉS.
      makeFijo({ id: 'b', category_id: 'cat-B', amount: 9000, next_due_on: '2026-06-25' }),
    ]
    const groups = groupFijosByCategory({
      items,
      categories: [
        { id: 'cat-A', name: 'Entretenimiento', color: '#ff0000' },
        { id: 'cat-B', name: 'Servicios', color: '#00ff00' },
      ],
    })
    expect(groups).toHaveLength(2)
    expect(groups[0]!.categoryId).toBe('cat-A') // vence antes, aunque sea más barata
    expect(groups[1]!.categoryId).toBe('cat-B')
  })

  it('items dentro de cada grupo ordenados por vencimiento (próximo primero, cross-mes)', () => {
    const items = [
      makeFijo({ id: 'a', category_id: 'cat-X', amount: 1, next_due_on: '2026-07-05' }),
      makeFijo({ id: 'b', category_id: 'cat-X', amount: 1, next_due_on: '2026-06-21' }),
      makeFijo({ id: 'c', category_id: 'cat-X', amount: 1, next_due_on: '2026-06-30' }),
    ]
    const [group] = groupFijosByCategory({
      items,
      categories: [{ id: 'cat-X', name: 'X', color: '#000' }],
    })
    // 21 jun → 30 jun → 5 jul. El sort por dayOfMonth viejo daba [5jul, 21jun, 30jun].
    expect(group!.items.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('sin categoría → fallback a "Sin categoría" / #8A8A8A', () => {
    const items = [makeFijo({ id: 'a', category_id: null, amount: 100 })]
    const [group] = groupFijosByCategory({ items, categories: [] })
    expect(group!.label).toBe('Sin categoría')
    expect(group!.color).toBe('#8A8A8A')
  })

  it('input vacío → array vacío', () => {
    expect(groupFijosByCategory({ items: [], categories: [] })).toEqual([])
  })
})
