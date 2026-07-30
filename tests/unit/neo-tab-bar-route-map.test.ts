import { describe, expect, it } from 'vitest'

import {
  NEO_TAB_KEY_TO_ROUTE,
  NEO_TAB_ROUTE_TO_KEY,
  routeNameToTabKey,
  tabKeyToRouteName,
  type NeoTabKey,
  type NeoTabRoute,
} from '@/components/navigation/neo-tab-bar-route-map'

// Tabla maestra (PLAN-NAV-CABLEADO.md §"Tabla key↔ruta"). Los nombres NO
// coinciden — este test la fija en las DOS direcciones para que un rename de
// `Tabs.Screen name` (o de una key del kit) rompa acá antes que en runtime.
const PAIRS: ReadonlyArray<{ route: NeoTabRoute; key: NeoTabKey }> = [
  { route: 'home', key: 'inicio' },
  { route: 'expenses', key: 'gastos' },
  { route: 'fixed-expenses', key: 'fijos' },
  { route: 'insights', key: 'control' },
]

describe('neo-tab-bar-route-map — ruta ↔ key (4 tabs, sin FAB)', () => {
  it('ruta live → key del kit (todas)', () => {
    for (const { route, key } of PAIRS) {
      expect(routeNameToTabKey(route)).toBe(key)
      expect(NEO_TAB_ROUTE_TO_KEY[route]).toBe(key)
    }
  })

  it('key del kit → ruta live (todas)', () => {
    for (const { route, key } of PAIRS) {
      expect(tabKeyToRouteName(key)).toBe(route)
      expect(NEO_TAB_KEY_TO_ROUTE[key]).toBe(route)
    }
  })

  it('round-trip: los dos maps son inversos exactos', () => {
    for (const { route, key } of PAIRS) {
      expect(tabKeyToRouteName(routeNameToTabKey(route) as NeoTabKey)).toBe(route)
      expect(routeNameToTabKey(tabKeyToRouteName(key))).toBe(key)
    }
  })

  it('cada map tiene exactamente las 4 entradas (nada de más, nada de menos)', () => {
    expect(Object.keys(NEO_TAB_ROUTE_TO_KEY).sort()).toEqual(
      ['expenses', 'fixed-expenses', 'home', 'insights'],
    )
    expect(Object.keys(NEO_TAB_KEY_TO_ROUTE).sort()).toEqual(
      ['control', 'fijos', 'gastos', 'inicio'],
    )
  })

  it('la ruta `add` (FAB central) NO tiene key — se excluye del map de ítems', () => {
    expect(routeNameToTabKey('add')).toBeUndefined()
    expect((NEO_TAB_ROUTE_TO_KEY as Record<string, unknown>).add).toBeUndefined()
  })

  it('rutas desconocidas → undefined (no revientan, no marcan tab activa)', () => {
    expect(routeNameToTabKey('settings')).toBeUndefined()
    expect(routeNameToTabKey('')).toBeUndefined()
    expect(routeNameToTabKey('Home')).toBeUndefined() // case-sensitive
  })
})
