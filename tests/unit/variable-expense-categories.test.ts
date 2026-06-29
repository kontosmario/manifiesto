import { describe, expect, it } from 'vitest'
import { filterVariableExpenseCategories } from '@/features/expenses/variable-expense-categories'
import type { Category } from '@/features/categories/use-categories'

function category(overrides: Partial<Category>): Category {
  return {
    id: overrides.id ?? 'cat-' + (overrides.name ?? 'x'),
    family_id: 'fam-1',
    name: overrides.name ?? 'Otros',
    color: '#000000',
    template_id: null,
    scope: 'expense',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('filterVariableExpenseCategories (post-compactación)', () => {
  it('NO oculta Salud ni Educación (ahora son variables legítimas)', () => {
    const input = [
      category({ name: 'Mercado' }),
      category({ name: 'Salud' }),
      category({ name: 'Educación' }),
      category({ name: 'Ocio' }),
    ]
    const result = filterVariableExpenseCategories(input)
    expect(result.map((c) => c.name)).toEqual([
      'Mercado',
      'Salud',
      'Educación',
      'Ocio',
    ])
  })

  it('deja pasar todo el catálogo compactado sin filtrar', () => {
    const names = [
      'Mercado',
      'Comida y salidas',
      'Transporte',
      'Hogar',
      'Cuidado personal',
      'Otros',
    ]
    const input = names.map((name) => category({ name }))
    expect(filterVariableExpenseCategories(input).map((c) => c.name)).toEqual(names)
  })

  it('deja pasar categorías custom del usuario', () => {
    const input = [
      category({ name: 'Mi categoría rara' }),
      category({ name: 'Mercado' }),
    ]
    expect(filterVariableExpenseCategories(input).map((c) => c.name)).toEqual([
      'Mi categoría rara',
      'Mercado',
    ])
  })

  it('returns an empty array unchanged', () => {
    expect(filterVariableExpenseCategories([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [category({ name: 'Salud' }), category({ name: 'Mercado' })]
    const snapshot = [...input]
    filterVariableExpenseCategories(input)
    expect(input).toEqual(snapshot)
  })
})
