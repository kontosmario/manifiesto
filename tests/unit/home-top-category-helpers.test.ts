import { describe, expect, it } from 'vitest'
import {
  computeTopCategory,
  computeTopCategoryFallback,
  formatTopCategoryShare,
  type TopCategoryResult,
} from '@/components/home/home-top-category-helpers'
import type { Expense } from '@/features/expenses/use-expenses'

function expense(args: {
  id: string
  category_id: string
  price: number
  created_at: string
  commitment_id?: string | null
}): Expense {
  return {
    id: args.id,
    family_id: 'fam',
    user_id: 'u1',
    creator_display_name: 'tester',
    created_by: 'u1',
    category_id: args.category_id,
    commitment_id: args.commitment_id ?? null,
    created_at: args.created_at,
    description: 'tx',
    price: args.price,
  }
}

const cycleStart = new Date('2026-04-01T00:00:00')
const cycleEnd = new Date('2026-05-01T00:00:00')
const categories = new Map([
  ['cat-food', 'Comida'],
  ['cat-transport', 'Transporte'],
])

describe('computeTopCategory', () => {
  it('returns the category with the highest cycle spend', () => {
    const expenses = [
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-10T10:00:00' }),
      expense({ id: '3', category_id: 'cat-transport', price: 2000, created_at: '2026-04-12T10:00:00' }),
      expense({ id: '4', category_id: 'cat-transport', price: 1500, created_at: '2026-04-15T10:00:00' }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
    })
    expect(out).toEqual({
      categoryId: 'cat-food',
      name: 'Comida',
      total: 8000,
      share: 8000 / 11500,
    })
  })

  it('surfaces the leader from day 1 once there are enough transactions', () => {
    // All four transactions on the very first day of the cycle. The
    // closedDays gate used to suppress this; now the chip shows.
    const expenses = [
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-01T08:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-01T09:00:00' }),
      expense({ id: '3', category_id: 'cat-food', price: 2000, created_at: '2026-04-01T10:00:00' }),
      expense({ id: '4', category_id: 'cat-food', price: 1000, created_at: '2026-04-01T11:00:00' }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
    })
    expect(out?.categoryId).toBe('cat-food')
  })

  it('returns null when fewer than 4 transactions exist', () => {
    const expenses = [
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-10T10:00:00' }),
      expense({ id: '3', category_id: 'cat-transport', price: 2000, created_at: '2026-04-12T10:00:00' }),
    ]
    expect(
      computeTopCategory({
        expenses,
        cycleStart,
        cycleEnd,
        categoryNameById: categories,
      }),
    ).toBeNull()
  })

  it('skips expenses with commitment_id (auto-recorded fixed payments)', () => {
    const expenses = [
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-10T10:00:00' }),
      expense({ id: '3', category_id: 'cat-food', price: 1000, created_at: '2026-04-12T10:00:00' }),
      expense({ id: '4', category_id: 'cat-food', price: 500, created_at: '2026-04-13T10:00:00' }),
      expense({
        id: 'auto',
        category_id: 'cat-rent',
        price: 999_999,
        created_at: '2026-04-15T10:00:00',
        commitment_id: 'fe-rent',
      }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
    })
    expect(out?.categoryId).toBe('cat-food')
  })

  it('excludes expenses outside the cycle window', () => {
    const expenses = [
      expense({ id: 'a', category_id: 'cat-food', price: 100_000, created_at: '2026-03-15T10:00:00' }),
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-10T10:00:00' }),
      expense({ id: '3', category_id: 'cat-food', price: 1000, created_at: '2026-04-12T10:00:00' }),
      expense({ id: '4', category_id: 'cat-food', price: 500, created_at: '2026-04-13T10:00:00' }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
    })
    expect(out?.total).toBe(9500) // not 109_500
  })

  it('falls back to "Sin categoría" when category is missing', () => {
    const expenses = [
      expense({ id: '1', category_id: '', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: '', price: 3000, created_at: '2026-04-10T10:00:00' }),
      expense({ id: '3', category_id: '', price: 1000, created_at: '2026-04-12T10:00:00' }),
      expense({ id: '4', category_id: '', price: 500, created_at: '2026-04-13T10:00:00' }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
    })
    expect(out?.name).toBe('Sin categoría')
    expect(out?.categoryId).toBe('')
  })

  it('returns null when no expenses match the cycle', () => {
    expect(
      computeTopCategory({
        expenses: [],
        cycleStart,
        cycleEnd,
        categoryNameById: categories,
      }),
    ).toBeNull()
  })

  it('respects custom minTransactions threshold', () => {
    const expenses = [
      expense({ id: '1', category_id: 'cat-food', price: 5000, created_at: '2026-04-05T10:00:00' }),
      expense({ id: '2', category_id: 'cat-food', price: 3000, created_at: '2026-04-10T10:00:00' }),
    ]
    const out = computeTopCategory({
      expenses,
      cycleStart,
      cycleEnd,
      categoryNameById: categories,
      minTransactions: 2,
    })
    expect(out?.categoryId).toBe('cat-food')
  })
})

describe('formatTopCategoryShare', () => {
  it('rounds to integer percent', () => {
    expect(formatTopCategoryShare(0.32)).toBe('32%')
    expect(formatTopCategoryShare(0.999)).toBe('100%')
    expect(formatTopCategoryShare(0.005)).toBe('1%')
    expect(formatTopCategoryShare(0)).toBe('0%')
  })
})

describe('computeTopCategoryFallback', () => {
  const present: TopCategoryResult = {
    categoryId: 'c1',
    name: 'Mercado',
    total: 12_000,
    share: 0.32,
  }

  it('returns null when topCategory is non-null (no fallback needed)', () => {
    expect(
      computeTopCategoryFallback({
        topCategory: present,
        variableCount: 30,
      }),
    ).toBeNull()
  })

  it('returns empty kind when there are no variable transactions', () => {
    const out = computeTopCategoryFallback({
      topCategory: null,
      variableCount: 0,
    })
    expect(out?.kind).toBe('empty')
    expect(out?.primary).toMatch(/Carga tu primer gasto/) // copy refresh: drop accent
  })

  it('returns sparse kind when transactions are below the minimum', () => {
    const out = computeTopCategoryFallback({
      topCategory: null,
      variableCount: 2,
    })
    expect(out?.kind).toBe('sparse')
    expect(out?.secondary).toMatch(/Carga más gastos/) // copy refresh: drop accent
  })

  it('falls through to a generic sparse copy when the gate passes but the helper still returned null', () => {
    const out = computeTopCategoryFallback({
      topCategory: null,
      variableCount: 10,
    })
    expect(out?.kind).toBe('sparse')
    expect(out?.secondary).toMatch(/Aún no hay datos suficientes/)
  })

  it('respects custom minTransactions threshold', () => {
    const out = computeTopCategoryFallback({
      topCategory: null,
      variableCount: 1,
      minTransactions: 2,
    })
    expect(out?.kind).toBe('sparse')
    expect(out?.secondary).toMatch(/Carga más gastos/) // copy refresh: drop accent
  })
})
