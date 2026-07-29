/**
 * Mapa ruta↔key de la nav nueva (F4 del cableado — ver
 * design/home-final-2026-07/PLAN-NAV-CABLEADO.md).
 *
 * Los nombres NO coinciden entre expo-router (`Tabs.Screen name`) y las keys
 * del kit visual (`HomeNavBar`/`NeoTabBarLive`): el kit usa slugs en español.
 * Este archivo es la ÚNICA fuente de esa traducción, aislado como módulo puro
 * (sin deps nativas) para que el test unit lo importe bajo el entorno Node de
 * vitest y verifique el map en las dos direcciones.
 *
 * La ruta `add` (FAB central) se excluye a propósito: la barra dibuja 4 tabs
 * + el FAB manual, así que `add` no tiene key. Su `Redirect → /(app)/add-expense`
 * (app/(app)/(tabs)/add.tsx) sigue montado para deep-links.
 */

/** Keys de tab del kit visual (orden inicio · gastos · fijos · control). */
export type NeoTabKey = 'inicio' | 'gastos' | 'fijos' | 'control'

/** Nombres de ruta live que participan de la barra (sin `add`). */
export type NeoTabRoute = 'home' | 'expenses' | 'fixed-expenses' | 'insights'

/** ruta live → key del kit. Excluye `add` (FAB, sin key). */
export const NEO_TAB_ROUTE_TO_KEY: Record<NeoTabRoute, NeoTabKey> = {
  home: 'inicio',
  expenses: 'gastos',
  'fixed-expenses': 'fijos',
  insights: 'control',
}

/** key del kit → ruta live (inversa de NEO_TAB_ROUTE_TO_KEY). */
export const NEO_TAB_KEY_TO_ROUTE: Record<NeoTabKey, NeoTabRoute> = {
  inicio: 'home',
  gastos: 'expenses',
  fijos: 'fixed-expenses',
  control: 'insights',
}

/**
 * Traduce un `Tabs.Screen name` a la key del kit. Devuelve `undefined` para
 * rutas que la barra NO dibuja como ítem (p.ej. `add` → FAB, o cualquier ruta
 * desconocida): el llamador decide qué hacer (activeTab queda sin marcar).
 */
export function routeNameToTabKey(routeName: string): NeoTabKey | undefined {
  return (NEO_TAB_ROUTE_TO_KEY as Record<string, NeoTabKey | undefined>)[routeName]
}

/** Traduce una key del kit al `Tabs.Screen name` live. */
export function tabKeyToRouteName(key: NeoTabKey): NeoTabRoute {
  return NEO_TAB_KEY_TO_ROUTE[key]
}
