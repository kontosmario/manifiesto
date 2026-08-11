import { describe, expect, it } from 'vitest'

type FijosTab = 'vencidos' | 'pendientes' | 'pagados'

/**
 * Las tabs de Fijos son DINÁMICAS: sólo se ve la que tiene datos (owner
 * 2026-08-08). Un "Vencidos 0" no filtra nada y encima afirma que existe una
 * categoría que está vacía.
 *
 * Estas dos funciones son la copia EXACTA de la lógica de
 * `use-fijos-controller` (el hook no se puede montar bajo vitest: no hay
 * renderer). Si el hook cambia, esto tiene que cambiar con él — el valor está
 * en fijar el contrato, sobre todo el de la redirección, que es donde un
 * error no se ve como error sino como "la lista quedó vacía".
 */
function visibleTabsFor(counts: Record<FijosTab, number>): FijosTab[] {
  return (['vencidos', 'pendientes', 'pagados'] as FijosTab[]).filter(
    (t) => counts[t] > 0,
  )
}

/** El tab que queda activo tras recalcular. `userTouched` respeta la elección
 *  del usuario mientras su tab siga existiendo. */
function resolveTab(
  current: FijosTab,
  visible: FijosTab[],
  userTouched: boolean,
): FijosTab {
  if (visible.length === 0) return current
  if (!visible.includes(current)) return visible[0]
  if (!userTouched && current !== visible[0]) return visible[0]
  return current
}

describe('qué tabs se ven', () => {
  it('sólo las que tienen datos', () => {
    expect(visibleTabsFor({ vencidos: 0, pendientes: 0, pagados: 1 })).toEqual([
      'pagados',
    ])
    expect(visibleTabsFor({ vencidos: 2, pendientes: 0, pagados: 3 })).toEqual([
      'vencidos',
      'pagados',
    ])
  })

  it('mantiene el orden de urgencia, no el de aparición', () => {
    expect(visibleTabsFor({ vencidos: 1, pendientes: 1, pagados: 1 })).toEqual([
      'vencidos',
      'pendientes',
      'pagados',
    ])
  })

  it('sin datos en ninguna, no se dibuja la barra', () => {
    // Antes se caía a ['pendientes'] y quedaba una tab sola diciendo
    // "Pendientes 0": un filtro que no filtra nada.
    expect(visibleTabsFor({ vencidos: 0, pendientes: 0, pagados: 0 })).toEqual([])
  })
})

describe('el tab activo nunca queda invisible', () => {
  it('pagar el último vencido salta a la siguiente por urgencia', () => {
    const antes = visibleTabsFor({ vencidos: 1, pendientes: 2, pagados: 0 })
    expect(resolveTab('vencidos', antes, true)).toBe('vencidos')
    // Se paga: vencidos queda en 0 y pagados en 1.
    const despues = visibleTabsFor({ vencidos: 0, pendientes: 2, pagados: 1 })
    expect(resolveTab('vencidos', despues, true)).toBe('pendientes')
  })

  it('respeta la elección del usuario mientras su tab exista', () => {
    const visible = visibleTabsFor({ vencidos: 1, pendientes: 1, pagados: 1 })
    expect(resolveTab('pagados', visible, true)).toBe('pagados')
  })

  it('sin interacción abre en la más urgente visible', () => {
    const visible = visibleTabsFor({ vencidos: 0, pendientes: 3, pagados: 1 })
    expect(resolveTab('pagados', visible, false)).toBe('pendientes')
  })

  it('con la barra vacía no intenta redirigir a undefined', () => {
    // `visible[0]` sería undefined: el guard es lo que evita dejar el tab en
    // un valor que no existe.
    expect(resolveTab('pendientes', [], true)).toBe('pendientes')
  })

  it('el tab resuelto SIEMPRE está entre los visibles (o no hay ninguno)', () => {
    const combos: Record<FijosTab, number>[] = []
    for (const v of [0, 2]) {
      for (const p of [0, 2]) {
        for (const g of [0, 2]) combos.push({ vencidos: v, pendientes: p, pagados: g })
      }
    }
    for (const counts of combos) {
      const visible = visibleTabsFor(counts)
      for (const current of ['vencidos', 'pendientes', 'pagados'] as FijosTab[]) {
        for (const touched of [true, false]) {
          const resolved = resolveTab(current, visible, touched)
          if (visible.length === 0) continue
          expect(visible, JSON.stringify({ counts, current, touched })).toContain(
            resolved,
          )
        }
      }
    }
  })
})
