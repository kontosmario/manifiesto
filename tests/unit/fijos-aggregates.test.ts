import { describe, it, expect } from 'vitest'
import {
  summarizeFijos,
  groupFijosByCategory,
  computeMissedCuotas,
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

  it('payment del cycle → paid (next_due_on no vencido)', () => {
    // v5: next_due_on ya NO puede estar en el pasado para que gane 'paid'
    // (overdue tiene prioridad — ver describe de v5 más abajo). Antes este
    // fixture usaba next_due_on='2026-06-03' (< TODAY) para probar que el
    // pago "pisaba cualquier next_due_on"; ese caso ahora es 'overdue' por
    // diseño. Movemos next_due_on dentro del ciclo activo, sin vencer, para
    // seguir probando lo que este test realmente verifica: que un payment
    // en el ciclo resuelve `paidPaymentId`.
    const item = makeFixed({ id: 'fx-pago', next_due_on: '2026-06-20' })
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
    // next_due_on dentro del ciclo, no vencido — ver comentario v5 en el
    // test anterior (overdue gana sobre paid si next_due_on ya pasó).
    const item = makeFixed({ id: 'fx-opt', next_due_on: '2026-06-20' })
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
      missedCuotas: 0,
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

describe('computeItemStatus v5 — overdue gana sobre paid (vía summarizeFijos)', () => {
  it('con pago en el ciclo pero next_due_on aún en el pasado → overdue', () => {
    // Debía may-15 y jun-1; pagó may (RPC avanzó next_due_on a jun-1,
    // que sigue < TODAY jun-8). Antes: 'paid' (deuda invisible).
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-01', last_paid_at: '2026-06-07T10:00:00Z' })],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-05-01',
          paidAt: '2026-06-07T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-07T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems).toHaveLength(1)
    expect(summary.paidItems).toHaveLength(0)
  })

  it('pagado al día (next_due_on avanzado fuera del ciclo) sigue siendo paid', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-07-15', last_paid_at: '2026-06-07T10:00:00Z' })],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-06-01',
          paidAt: '2026-06-07T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-07T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.paidItems).toHaveLength(1)
    expect(summary.overdueItems).toHaveLength(0)
  })

  it('semanal pagado semana 1 con siguiente vencimiento ya pasado → overdue', () => {
    // Pagó jun-1 (weekly, next_due_on avanzó a jun-8… ya venció de nuevo
    // el jun-5 — simulamos next_due_on jun-5 < TODAY jun-8).
    const summary = summarizeFijos({
      items: [
        makeFixed({
          frequency: 'weekly',
          next_due_on: '2026-06-05',
          last_paid_at: '2026-06-01T10:00:00Z',
        }),
      ],
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'fx-1',
          periodMonth: '2026-06-01',
          paidAt: '2026-06-01T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-01T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems).toHaveLength(1)
  })
})

describe('computeMissedCuotas', () => {
  const today = new Date('2026-06-08T12:00:00')
  it('0 cuando next_due_on es hoy o futuro', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-06-08', frequency: 'monthly', dayOfMonth: 8, today }),
    ).toEqual({ count: 0, periods: [] })
  })
  it('1 cuota vencida simple', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-06-05', frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 1, periods: ['2026-06-01'] })
  })
  it('acumula multi-mes (abr + may + jun)', () => {
    expect(
      computeMissedCuotas({ nextDueOn: '2026-04-05', frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 3, periods: ['2026-04-01', '2026-05-01', '2026-06-01'] })
  })
  it('quincenal acumula por salto de 14 días', () => {
    // may-20, jun-3 vencidas; jun-17 futura.
    expect(
      computeMissedCuotas({ nextDueOn: '2026-05-20', frequency: 'biweekly', dayOfMonth: 20, today }),
    ).toEqual({ count: 2, periods: ['2026-05-01', '2026-06-01'] })
  })
  it('mes corto no rompe la cadena (ene-31 → feb-28 → mar-31)', () => {
    expect(
      computeMissedCuotas({
        nextDueOn: '2026-01-31',
        frequency: 'monthly',
        dayOfMonth: 31,
        today: new Date('2026-03-15T12:00:00'),
      }),
    ).toEqual({ count: 2, periods: ['2026-01-01', '2026-02-01'] })
  })
  it('null → 0', () => {
    expect(
      computeMissedCuotas({ nextDueOn: null, frequency: 'monthly', dayOfMonth: 5, today }),
    ).toEqual({ count: 0, periods: [] })
  })
  it('endsOn corta cuotas posteriores al fin del plan (FIX 3c)', () => {
    // Sin endsOn: abr+may+jun = 3 (ver test 'acumula multi-mes' arriba).
    // Con endsOn=10-may: jun-5 > 10-may → se corta ahí, quedan abr+may.
    expect(
      computeMissedCuotas({
        nextDueOn: '2026-04-05',
        frequency: 'monthly',
        dayOfMonth: 5,
        today,
        endsOn: '2026-05-10',
      }),
    ).toEqual({ count: 2, periods: ['2026-04-01', '2026-05-01'] })
  })
  it('endsOn null/omitido no cambia el comportamiento existente', () => {
    expect(
      computeMissedCuotas({
        nextDueOn: '2026-04-05',
        frequency: 'monthly',
        dayOfMonth: 5,
        today,
        endsOn: null,
      }),
    ).toEqual({ count: 3, periods: ['2026-04-01', '2026-05-01', '2026-06-01'] })
  })
})

describe('daysUntilDue real (diferencia de fechas)', () => {
  it('pendiente a 7 días devuelve 7 aunque cruce de mes', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-15', day_of_month: 15 })],
      paymentsThisCycle: [],
      today: TODAY, // 2026-06-08
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.daysUntilDue).toBe(7)
  })
  it('vencido devuelve 0, no el wrap del ciclo', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-05', day_of_month: 5 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems[0]?.daysUntilDue).toBe(0) // antes: 27 (wrap)
  })
  it('quincenal con vencimiento a 10 días devuelve 10 (antes usaba el ancla mensual)', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ frequency: 'biweekly', next_due_on: '2026-06-18', day_of_month: 4 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.daysUntilDue).toBe(10) // ancla día 4 daba 26
  })
})

describe('summarizeFijos — missedCuotas y overdueAmount', () => {
  it('overdueAmount multiplica por las cuotas vencidas', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-04-05', day_of_month: 5, amount: 5000 })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.overdueItems[0]?.missedCuotas).toBe(3)
    expect(summary.overdueAmount).toBe(15000)
  })
  it('items no vencidos llevan missedCuotas 0', () => {
    const summary = summarizeFijos({
      items: [makeFixed({ next_due_on: '2026-06-15' })],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(summary.pendingItems[0]?.missedCuotas).toBe(0)
  })
})

describe('summarizeFijos — FIX1: multi-cuota solo en frecuencias con identidad mensual', () => {
  // `fixed_expense_payments` tiene `unique(fixed_expense_id, period_month)` y
  // la RPC estampa `period_month = date_trunc('month', next_due_on)` — dos
  // cuotas de un weekly/biweekly caídas en el MISMO mes no pueden coexistir
  // en el ledger. missedCuotas debe quedar en 1 para esas frecuencias, aunque
  // la cadena cronológica cruda tenga más.
  it('weekly con 2+ cuotas vencidas en el mismo lapso → missedCuotas capado a 1', () => {
    const item = makeFixed({
      frequency: 'weekly',
      next_due_on: '2026-05-01',
      day_of_month: 1,
      amount: 1000,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(1)
    expect(s.overdueAmount).toBe(1000)
  })

  it('biweekly con 2 cuotas vencidas → missedCuotas capado a 1', () => {
    const item = makeFixed({
      frequency: 'biweekly',
      next_due_on: '2026-05-20',
      day_of_month: 20,
      amount: 2000,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(1)
    expect(s.overdueAmount).toBe(2000)
  })

  it('monthly con 3 cuotas vencidas → NO se capa (identidad de cuota única por mes)', () => {
    const item = makeFixed({
      frequency: 'monthly',
      next_due_on: '2026-04-05',
      day_of_month: 5,
      amount: 5000,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(3)
    expect(s.overdueAmount).toBe(15000)
  })
})

describe('summarizeFijos — FIX2: total coherente con paid+pending+overdue', () => {
  it('total = paidAmount + pendingAmount + overdueAmount, incluso con multi-cuota', () => {
    const item = makeFixed({ amount: 5000, next_due_on: '2026-04-05', day_of_month: 5 })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueAmount).toBe(15000)
    // Antes: total contaba el fijo UNA vez (5000) mientras overdueAmount ya
    // sumaba sus 3 cuotas (15000) — "POR PAGAR $15.000 … de $5.000 en total".
    expect(s.total).toBe(15000)
    expect(s.overduePct).toBe(100)
  })

  it('paidPct + pendingPct + overduePct nunca supera 100 con deuda multi-cuota en la mezcla', () => {
    const items = [
      makeFixed({ id: 'paid', amount: 2000, next_due_on: '2026-06-20' }),
      makeFixed({ id: 'pend', amount: 1000, next_due_on: '2026-06-25' }),
      makeFixed({ id: 'over', amount: 1500, next_due_on: '2026-04-05', day_of_month: 5 }),
    ]
    const s = summarizeFijos({
      items,
      paymentsThisCycle: [
        {
          id: 'pay-1',
          fixedExpenseId: 'paid',
          periodMonth: '2026-06-01',
          paidAt: '2026-06-04T10:00:00Z',
          paidBy: 'user-1',
          createdAt: '2026-06-04T10:00:00Z',
          expenseId: 'exp-1',
        },
      ],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(3)
    expect(s.total).toBe(2000 + 1000 + 1500 * 3) // 7500
    expect(s.paidPct + s.pendingPct + s.overduePct).toBeLessThanOrEqual(100)
  })
})

describe('summarizeFijos — FIX3: la deuda no excede lo que queda del plan', () => {
  it('installment con 2 cuotas restantes y 4 meses de atraso → missedCuotas capado a 2', () => {
    const item = makeFixed({
      kind: 'installment',
      installments_total: 6,
      installments_paid: 4, // quedan 2
      amount: 3000,
      next_due_on: '2026-03-05',
      day_of_month: 5,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(2)
    expect(s.overdueAmount).toBe(6000)
  })

  it('installment sin cuotas restantes pero vencido → missedCuotas nunca baja de 1', () => {
    const item = makeFixed({
      kind: 'installment',
      installments_total: 4,
      installments_paid: 4, // 0 restantes
      amount: 1000,
      next_due_on: '2026-03-05',
      day_of_month: 5,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.missedCuotas).toBe(1)
    expect(s.overdueAmount).toBe(1000)
  })

  it('debt con remaining_balance chico → el monto vencido no supera remaining_balance', () => {
    const item = makeFixed({
      kind: 'debt',
      amount: 1000,
      remaining_balance: 2500,
      next_due_on: '2026-03-05',
      day_of_month: 5,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    // raw = 4 cuotas (mar,abr,may,jun); floor(2500/1000) = 2.
    expect(s.overdueItems[0]?.missedCuotas).toBe(2)
    expect(s.overdueAmount).toBe(2000)
    expect(s.overdueAmount).toBeLessThanOrEqual(2500)
  })

  it('ends_on anterior a alguna cuota → no cuenta cuotas posteriores al fin del plan', () => {
    const item = makeFixed({
      amount: 1000,
      next_due_on: '2026-03-05',
      day_of_month: 5,
      ends_on: '2026-04-10',
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    // raw sin ends_on = 4 (mar,abr,may,jun); con ends_on=10-abr solo mar y abr.
    expect(s.overdueItems[0]?.missedCuotas).toBe(2)
    expect(s.overdueAmount).toBe(2000)
  })
})

describe('summarizeFijos — FIX4: pausado vencido cuenta como 1', () => {
  it('paused con varias cuotas de atraso → missedCuotas capado a 1, sigue overdue y pagable', () => {
    const item = makeFixed({
      status: 'paused',
      next_due_on: '2026-04-05',
      day_of_month: 5,
      amount: 5000,
    })
    const s = summarizeFijos({
      items: [item],
      paymentsThisCycle: [],
      today: TODAY,
      monthlyStart: MONTHLY_START,
      monthlyEnd: MONTHLY_END,
      monthlyDays: MONTHLY_DAYS,
    })
    expect(s.overdueItems[0]?.computedStatus).toBe('overdue')
    expect(s.overdueItems[0]?.missedCuotas).toBe(1)
    expect(s.overdueAmount).toBe(5000)
  })
})
