import { describe, expect, it } from 'vitest'
import {
  NAV_KEY_GROUPS,
  NAV_WELL_PADDING_X,
  resolveIndicatorX,
  resolveWellWidth,
  slotCenterX,
  type GroupOffsets,
  type SlotRects,
} from '@/components/navigation/nav-indicator-geometry'
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'

// Layout de referencia: dos grupos de 2 ítems. Los `x` de los slots son
// RELATIVOS a su grupo (así los reporta onLayout), los del grupo son
// relativos a la barra.
const GROUPS: GroupOffsets = { left: 20, right: 240 }
const SLOTS: SlotRects = {
  inicio: { x: 0, width: 50 },
  gastos: { x: 60, width: 56 },
  fijos: { x: 0, width: 44 },
  control: { x: 54, width: 62 },
}

describe('NAV_KEY_GROUPS', () => {
  // Catálogo completo de `NeoTabKey`. Si este literal y el tipo divergen,
  // tsc lo marca (asignar una key inválida acá es un error de tipos).
  const ALL_KEYS: readonly NeoTabKey[] = ['inicio', 'gastos', 'fijos', 'control']

  it('particiona cada NeoTabKey exactamente una vez, sin faltantes ni sobrantes', () => {
    const combined = [...NAV_KEY_GROUPS.left, ...NAV_KEY_GROUPS.right]
    expect(combined).toHaveLength(ALL_KEYS.length)
    expect([...combined].sort()).toEqual([...ALL_KEYS].sort())
  })

  it('no repite ninguna key entre los dos grupos', () => {
    const overlap = NAV_KEY_GROUPS.left.filter((key) => NAV_KEY_GROUPS.right.includes(key))
    expect(overlap).toHaveLength(0)
  })
})

describe('slotCenterX', () => {
  it('suma el offset del grupo al centro del slot', () => {
    expect(slotCenterX(20, { x: 60, width: 56 })).toBe(108)
  })
})

describe('resolveWellWidth', () => {
  it('usa el slot MÁS ANCHO más el padding a ambos lados', () => {
    // el más ancho es control (62) → 62 + 7*2
    expect(resolveWellWidth(SLOTS)).toBe(62 + NAV_WELL_PADDING_X * 2)
  })

  it('devuelve 0 sin mediciones (todavía no hubo onLayout)', () => {
    expect(resolveWellWidth({})).toBe(0)
  })

  it('ignora slots a medio medir', () => {
    expect(resolveWellWidth({ inicio: { x: 0, width: 50 } })).toBe(
      50 + NAV_WELL_PADDING_X * 2,
    )
  })
})

describe('resolveIndicatorX', () => {
  const wellWidth = resolveWellWidth(SLOTS)

  it('centra el surco sobre el slot activo', () => {
    // gastos: centro = 20 + 60 + 56/2 = 108 → x = 108 - wellWidth/2
    expect(resolveIndicatorX(SLOTS, GROUPS, 'gastos', wellWidth)).toBe(
      108 - wellWidth / 2,
    )
  })

  it('usa el offset del grupo DERECHO para fijos y control', () => {
    // fijos: centro = 240 + 0 + 44/2 = 262
    expect(resolveIndicatorX(SLOTS, GROUPS, 'fijos', wellWidth)).toBe(
      262 - wellWidth / 2,
    )
  })

  it('devuelve null si el slot activo todavía no se midió', () => {
    expect(resolveIndicatorX({}, GROUPS, 'inicio', wellWidth)).toBeNull()
  })

  it('devuelve null con ancho de surco 0 (nada que posicionar)', () => {
    expect(resolveIndicatorX(SLOTS, GROUPS, 'inicio', 0)).toBeNull()
  })
})
