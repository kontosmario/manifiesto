import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

/**
 * Cooldown helper for permission priming sheets.
 *
 * Cuando el usuario tapea "Más tarde" en un pre-prompt (notifs /
 * biometric), guardamos el timestamp y no volvemos a mostrarlo por
 * 7 días. Si tapea "Permitir" (independientemente de la respuesta
 * nativa) marcamos como "intentado" para no re-promptear el sheet.
 *
 * Storage: SecureStore on native, localStorage on web — vía
 * `persistent-kv`. Sin namespace por userId porque el priming es
 * intuitivamente por-dispositivo (un usuario que dijo "más tarde" en
 * su iPhone no quiere que se le insista al volver a loguearse).
 *
 * Keys reservadas:
 *   - `prime_dismissed_notifications`
 *   - `prime_dismissed_biometric`
 */

const PREFIX = 'prime_dismissed_'

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export type PrimeKey = 'notifications' | 'biometric'

function keyFor(key: PrimeKey): string {
  return `${PREFIX}${key}`
}

/**
 * Returns `true` if the priming sheet should be shown (i.e. either
 * never dismissed, or dismissed >7 days ago).
 */
export async function shouldPrimePermission(key: PrimeKey): Promise<boolean> {
  const dismissedAt = await getPersistentValue(keyFor(key))
  if (!dismissedAt) return true
  const ms = Number.parseInt(dismissedAt, 10)
  if (!Number.isFinite(ms)) return true
  return Date.now() - ms >= COOLDOWN_MS
}

/**
 * Marca el priming como "dismissed ahora" — el sheet no volverá a
 * mostrarse por `COOLDOWN_MS` ms.
 */
export async function markPrimeDismissed(key: PrimeKey): Promise<void> {
  await setPersistentValue(keyFor(key), String(Date.now()))
}

/**
 * Limpia el cooldown — útil al hacer logout o si el usuario activó
 * el permiso desde Ajustes (queremos que el priming reaparezca en una
 * futura desinstalación/reinstall si lo desactivó).
 */
export async function clearPrimeDismissed(key: PrimeKey): Promise<void> {
  await deletePersistentValue(keyFor(key))
}
