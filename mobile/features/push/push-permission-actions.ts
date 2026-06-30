import { Linking } from 'react-native'

import {
  getNotificationPermission,
  requestNotificationPermissions,
  setupPushNotifications,
} from '@/lib/push-notifications'
import {
  markPrimeDismissed,
  shouldPrimePermission,
} from '@/lib/permission-prime-cooldown'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'

/**
 * Lógica pura (sin React) del priming de permiso de push. Vive separada del
 * hook para poder testear las decisiones. Todas las funciones son
 * fail-safe: NUNCA propagan — los call-sites (onboarding `handleContinue`,
 * el trigger del Home) navegan/siguen sin try-catch propio.
 */

/** Marca el cooldown sin propagar (escritura a SecureStore best-effort). */
async function markCooldownBestEffort(): Promise<void> {
  try {
    await markPrimeDismissed('notifications')
  } catch {
    // best-effort
  }
}

/**
 * Elegible para mostrar el priming sheet: el build soporta push, el usuario
 * todavía NO concedió el permiso, y el cooldown (7d) está vencido. Ante
 * CUALQUIER error leyendo el estado devuelve `false` (fail-closed) — nunca
 * propaga, así un fallo del native layer no rompe al caller (p.ej. dejar al
 * usuario trabado en onboarding-success sin navegar).
 */
export async function isPushPrimeEligible(): Promise<boolean> {
  try {
    if (!canUseNativePushNotifications) return false
    const { status } = await getNotificationPermission()
    if (status === 'granted' || status === 'unsupported') return false
    return await shouldPrimePermission('notifications')
  } catch {
    return false
  }
}

/**
 * "Permitir". Fail-safe (nunca propaga). Flujo:
 *   - Si el OS ya está en hard-deny (denied + !canAskAgain) NO tiene sentido
 *     pedir de nuevo → marcamos el cooldown y abrimos Ajustes (única salida).
 *   - Si no, disparamos el prompt nativo y marcamos el cooldown DESPUÉS de
 *     tener respuesta del OS (no antes): si el prompt tira error o el user
 *     mata la app sin responder, NO marcamos y volvemos a preguntar la
 *     próxima vez (evita un lockout de 7 días por un error transitorio).
 *   - Al conceder, registramos el token ya (no esperamos al próximo mount).
 * Un deny "fresco" (recién dicho que no) NO manda a Ajustes — se respeta.
 */
export async function applyPushPermissionAllow({
  userId,
  familyId,
}: {
  userId: string
  familyId?: string | null
}): Promise<void> {
  try {
    const before = await getNotificationPermission()
    if (before.status === 'denied' && !before.canAskAgain) {
      await markCooldownBestEffort()
      await Linking.openSettings()
      return
    }
    const res = await requestNotificationPermissions()
    await markCooldownBestEffort()
    if (res.granted && userId && familyId) {
      await setupPushNotifications({ userId, familyId })
    }
  } catch {
    // best-effort: el toggle "Activar push" de Ajustes sigue disponible.
  }
}

/** "Más tarde": marca el cooldown de 7 días (fail-safe). */
export async function applyPushPermissionDismiss(): Promise<void> {
  await markCooldownBestEffort()
}
