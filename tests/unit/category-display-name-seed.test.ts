import { describe, expect, it } from 'vitest'
import { withCategoryDisplayNames } from '@/features/categories/localize-category-name'

/**
 * Regresión: `home_snapshot` seedea el cache `categoriesQueryKey` con el
 * payload crudo del RPC, que NO trae `displayName` (campo derivado en
 * cliente vía i18n). El rail/picker de add-expense/add-fijo rendea
 * `category.displayName` → quedaba VACÍO. `withCategoryDisplayNames` debe
 * derivar el displayName en el seed para que los nombres se vean.
 */
describe('withCategoryDisplayNames (seed de home_snapshot)', () => {
  it('adjunta un displayName NO vacío a cada categoría', () => {
    const raw = [
      { id: '1', name: 'Supermercado', template_id: 't1', color: '#fff' },
      { id: '2', name: 'Mi categoría custom', template_id: null, color: '#000' },
    ]
    const result = withCategoryDisplayNames(raw, 'expense')
    expect(result).toHaveLength(2)
    for (const c of result) {
      expect(typeof c.displayName).toBe('string')
      expect(c.displayName.length).toBeGreaterThan(0)
    }
  })

  it('devuelve el name crudo para categorías custom/renombradas (template_id null)', () => {
    const [c] = withCategoryDisplayNames(
      [{ id: '2', name: 'Mi categoría custom', template_id: null }],
      'expense',
    )
    expect(c.displayName).toBe('Mi categoría custom')
  })

  it('preserva los campos originales (id, name, color)', () => {
    const [c] = withCategoryDisplayNames(
      [{ id: '1', name: 'Supermercado', template_id: 't1', color: '#abc' }],
      'expense',
    )
    expect(c.id).toBe('1')
    expect(c.name).toBe('Supermercado')
    expect((c as { color: string }).color).toBe('#abc')
  })
})
