import { describe, expect, it } from 'vitest'
import {
  ALL_CATEGORIES_KEY,
  resolveManagedCategoryId,
  resolveSelectedCategoryId,
} from '@/features/expenses/expense-history'

const categories = [
  {
    id: 'food',
    family_id: 'family-1',
    name: 'Comida',
    color: '#00AA00',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'transport',
    family_id: 'family-1',
    name: 'Transporte',
    color: '#0099FF',
    created_at: '2026-01-02T00:00:00.000Z',
  },
]

describe('expense-history selectors', () => {
  it('resolves the active filter category only when it exists', () => {
    expect(resolveSelectedCategoryId(categories, ALL_CATEGORIES_KEY)).toBe('')
    expect(resolveSelectedCategoryId(categories, 'food')).toBe('food')
    expect(resolveSelectedCategoryId(categories, 'missing')).toBe('')
  })

  it('resolves the managed category preferring explicit selection', () => {
    expect(
      resolveManagedCategoryId({
        categories,
        fallbackCategoryId: 'food',
        managedCategorySelection: 'transport',
      }),
    ).toBe('transport')
  })

  it('falls back to the filtered category or first available item when needed', () => {
    expect(
      resolveManagedCategoryId({
        categories,
        fallbackCategoryId: 'food',
        managedCategorySelection: 'missing',
      }),
    ).toBe('food')

    expect(
      resolveManagedCategoryId({
        categories,
        fallbackCategoryId: 'missing',
        managedCategorySelection: '',
      }),
    ).toBe('food')

    expect(
      resolveManagedCategoryId({
        categories: [],
        fallbackCategoryId: 'food',
        managedCategorySelection: 'transport',
      }),
    ).toBe('')
  })
})
