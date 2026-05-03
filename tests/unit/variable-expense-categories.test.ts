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

describe('filterVariableExpenseCategories', () => {
  it('removes the fixed-only categories (Alquiler, Servicios, Suscripciones) from the picker', () => {
    const input = [
      category({ name: 'Mercado' }),
      category({ name: 'Alquiler' }),
      category({ name: 'Transporte' }),
      category({ name: 'Servicios' }),
      category({ name: 'Suscripciones' }),
      category({ name: 'Ocio' }),
    ]
    const result = filterVariableExpenseCategories(input)
    expect(result.map((c) => c.name)).toEqual([
      'Mercado',
      'Transporte',
      'Ocio',
    ])
  })

  it('matches case-insensitively and tolerates leading/trailing whitespace', () => {
    const input = [
      category({ name: '  alquiler  ' }),
      category({ name: 'SERVICIOS' }),
      category({ name: 'Suscripciones ' }),
      category({ name: 'Mercado' }),
    ]
    const result = filterVariableExpenseCategories(input)
    expect(result.map((c) => c.name)).toEqual(['Mercado'])
  })

  it('keeps user-renamed categories that no longer match the canonical fixed names', () => {
    // If the user renames "Alquiler" to "Alquiler de auto" they
    // probably want it as a variable expense — the filter must not
    // strip categories that *contain* a fixed name as a substring.
    const input = [
      category({ name: 'Alquiler de auto' }),
      category({ name: 'Servicios profesionales' }),
      category({ name: 'Suscripción única' }),
    ]
    const result = filterVariableExpenseCategories(input)
    expect(result.map((c) => c.name)).toEqual([
      'Alquiler de auto',
      'Servicios profesionales',
      'Suscripción única',
    ])
  })

  it('returns an empty array unchanged', () => {
    expect(filterVariableExpenseCategories([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [
      category({ name: 'Alquiler' }),
      category({ name: 'Mercado' }),
    ]
    const snapshot = [...input]
    filterVariableExpenseCategories(input)
    expect(input).toEqual(snapshot)
  })
})
