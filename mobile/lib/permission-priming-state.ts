/**
 * Flag persistente que marca que el screen de priming de permisos ya
 * se mostró. Lo seteamos cuando el usuario completa el onboarding y
 * pasa por el priming, así no se lo volvemos a mostrar en próximos
 * cold-starts.
 *
 * Usamos SecureStore (via `persistent-kv`) en vez de AsyncStorage para
 * consistency con el resto del flujo de auth/onboarding — el costo es
 * idéntico para un flag string corto.
 */

import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const KEY = 'manifiesto.permission_priming_seen_v1'

export async function hasSeenPermissionPriming(): Promise<boolean> {
  const value = await getPersistentValue(KEY)
  return value === '1'
}

export async function markPermissionPrimingSeen(): Promise<void> {
  await setPersistentValue(KEY, '1')
}
