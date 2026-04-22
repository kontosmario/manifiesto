import { describe, expect, it } from 'vitest'
import {
  rankCategoriesByUsage,
  pickTopCategoryDescriptions,
} from '@/features/home/add-expense-model'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

const categories: Category[] = [
  { id: 'c1', name: 'Comida', family_id: 'f1', color: '#aaa', template_id: null, created_at: '' },
  { id: 'c2', name: 'Transporte', family_id: 'f1', color: '#bbb', template_id: null, created_at: '' },
  { id: 'c3', name: 'Casa', family_id: 'f1', color: '#ccc', template_id: null, created_at: '' },
]

function expense(
  id: string,
  categoryId: string,
  description: string,
  price = 1000,
): Expense {
  return {
    id,
    category_id: categoryId,
    description,
    price,
    family_id: 'f1',
    commitment_id: null,
    created_at: '2026-04-01T00:00:00Z',
    created_by: 'u1',
    creator_display_name: 'User 1',
  }
}

describe('rankCategoriesByUsage', () => {
  it('orders categories by frequency descending', () => {
    const expenses: Expense[] = [
      expense('e1', 'c2', 'subte'),
      expense('e2', 'c2', 'bondi'),
      expense('e3', 'c1', 'super'),
    ]
    const ranked = rankCategoriesByUsage(expenses, categories)
    expect(ranked.map((c) => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('tiebreaks by category name ascending', () => {
    const ranked = rankCategoriesByUsage([], categories)
    expect(ranked.map((c) => c.name)).toEqual(['Casa', 'Comida', 'Transporte'])
  })

  it('respects limit parameter', () => {
    const expenses: Expense[] = [expense('e1', 'c2', 'x')]
    expect(rankCategoriesByUsage(expenses, categories, 2)).toHaveLength(2)
  })
})

describe('pickTopCategoryDescriptions', () => {
  it('returns top descriptions for a category, most frequent first', () => {
    const expenses: Expense[] = [
      expense('e1', 'c1', 'Supermercado'),
      expense('e2', 'c1', 'Almuerzo'),
      expense('e3', 'c1', 'Supermercado'),
    ]
    const tops = pickTopCategoryDescriptions(expenses, 'c1', 5)
    expect(tops).toEqual(['Supermercado', 'Almuerzo'])
  })

  it('filters empty + whitespace-only descriptions', () => {
    const expenses: Expense[] = [
      expense('e1', 'c1', ''),
      expense('e2', 'c1', '   '),
      expense('e3', 'c1', 'Real'),
    ]
    expect(pickTopCategoryDescriptions(expenses, 'c1', 5)).toEqual(['Real'])
  })

  it('returns empty array when category has no expenses', () => {
    expect(pickTopCategoryDescriptions([], 'c1', 5)).toEqual([])
  })
})
