import { Platform } from 'react-native'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { supabase } from '@/lib/supabase'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import {
  type PendingCleanupEntry,
  pruneCleanupQueue,
} from '@/lib/push-cleanup-queue'

/**
 * Lightweight facade sobre `expo-notifications` para el setup
 * automático de push tras el login. Mantiene la separación clara:
 *
 *   - `requestNotificationPermissions()`: dispara el prompt nativo
 *     iOS (idempotente — re-llamar después de un grant no hace nada).
 *     Lo usa el priming sheet de onboarding-success-screen.
 *
 *   - `setupPushNotifications(userId, familyId)`: una vez por
 *     mount post-login, intenta registrar el token Expo Push en
 *     `push_subscriptions` (upsert por user_id+endpoint). Si el
 *     permiso no fue concedido, se vuelve no-op silencioso.
 *
 *   - `tearDownPushNotifications(userId)`: borra los tokens del
 *     usuario del backend. Lo usa el logout flow para que un device
 *     compartido no siga recibiendo push del usuario anterior.
 *
 * Por qué este archivo y no extender `use-push-notifications.ts`:
 *   - El hook existente es para el toggle manual en Settings (mutation
 *     con UI feedback). El setup automático es un side-effect del
 *     shell — no necesita estado React Query.
 *   - Mantenemos el flujo nuevo aislado para poder versionar la API
 *     sin tocar el hook que ya está battle-tested.
 *
 * Decisión Expo Push vs APNs directo: por ahora usamos Expo Push API
 * como proxy (`exp.host/--/api/v2/push/send`) — más simple, no
 * requiere APNs auth key + JWT signing. Migrar a APNs directo cuando
 * el owner cargue la `.p8` key + decida quitar la dependencia Expo
 * (relevante si llegamos a >100k notifs/día, donde el rate-limit de
 * Expo empieza a doler).
 */

const EXPO_PUSH_TOKEN_REGEX =
  /^(?:Exponent|Expo)PushToken\[[^\]]+\]$/

export interface PermissionRequestResult {
  granted: boolean
  /**
   * `true` cuando el OS bloquea futuros prompts (el user ya denegó
   * antes). En ese caso, la única salida es Ajustes del sistema.
   */
  canAskAgain: boolean
}

/**
 * Pide el permiso nativo de notifs (no-op si ya estaba concedido).
 * Devuelve `granted: false` en cualquier escenario "no se puede": web,
 * Expo Go, simulador, build sin entitlement aps-environment.
 */
export async function requestNotificationPermissions(): Promise<PermissionRequestResult> {
  if (!canUseNativePushNotifications) {
    return { granted: false, canAskAgain: false }
  }
  if (!Device.isDevice) {
    return { granted: false, canAskAgain: false }
  }

  const Notifications = await import('expo-notifications')
  const existing = await Notifications.getPermissionsAsync()
  if (existing.status === 'granted') {
    return { granted: true, canAskAgain: existing.canAskAgain ?? true }
  }
  if (existing.status === 'denied' && existing.canAskAgain === false) {
    return { granted: false, canAskAgain: false }
  }

  const request = await Notifications.requestPermissionsAsync()
  return {
    granted: request.status === 'granted',
    canAskAgain: request.canAskAgain ?? false,
  }
}

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported'

/**
 * Lee el estado del permiso SIN disparar el prompt nativo. `unsupported`
 * cuando el build no puede recibir push (web / Expo Go / simulador). Lo
 * usa el re-prompt del Home para decidir si mostrar el priming sheet.
 */
export async function getNotificationPermission(): Promise<{
  status: NotificationPermissionStatus
  canAskAgain: boolean
}> {
  if (!canUseNativePushNotifications || !Device.isDevice) {
    return { status: 'unsupported', canAskAgain: false }
  }
  const Notifications = await import('expo-notifications')
  const existing = await Notifications.getPermissionsAsync()
  const status: NotificationPermissionStatus =
    existing.status === 'granted'
      ? 'granted'
      : existing.status === 'denied'
        ? 'denied'
        : 'undetermined'
  return { status, canAskAgain: existing.canAskAgain ?? true }
}

async function fetchExpoPushToken(): Promise<string | null> {
  if (!canUseNativePushNotifications || !Device.isDevice) return null

  const Notifications = await import('expo-notifications')

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null

  if (!projectId) {
    return null
  }

  try {
    const response = await Notifications.getExpoPushTokenAsync({ projectId })
    return response.data ?? null
  } catch {
    // El error más común aquí es `aps-environment entitlement missing`
    // en builds sideloaded sin Apple Dev firma. El path automático
    // tiene que tragar el error: el toggle manual de Settings ya
    // expone el error vía mutation a la UI.
    return null
  }
}

interface SetupOptions {
  userId: string
  /**
   * Cuando esté disponible, lo guardamos junto al token para que el
   * edge function pueda filtrar por familia sin un join extra.
   * Si llegó antes que la familia, el token se re-upserta cuando
   * `setupPushNotifications` corra de nuevo (cada mount).
   */
  familyId?: string | null
}

export interface SetupResult {
  status: 'ok' | 'no-permission' | 'no-token' | 'not-supported' | 'error'
  token?: string
}

/**
 * Llamar UNA vez por mount post-login. Si el permiso ya estaba
 * concedido, registra el token en backend (upsert idempotente). Si
 * no hay permiso, no fuerza el prompt — el priming de onboarding-
 * success-screen ya lo manejó (o lo hará en una próxima sesión).
 */
export async function setupPushNotifications({
  userId,
  familyId,
}: SetupOptions): Promise<SetupResult> {
  if (!canUseNativePushNotifications) {
    return { status: 'not-supported' }
  }
  if (!Device.isDevice) {
    return { status: 'not-supported' }
  }
  if (!userId) {
    return { status: 'error' }
  }
  // `push_subscriptions.family_id` es NOT NULL en el esquema actual.
  // Si todavía no hay familia (usuario recién signupeado, sin
  // onboarding), salimos sin registrar y reintentamos cuando el
  // shell observe el familyId en un próximo render.
  if (!familyId) {
    return { status: 'no-token' }
  }

  const Notifications = await import('expo-notifications')
  const existing = await Notifications.getPermissionsAsync()
  if (existing.status !== 'granted') {
    return { status: 'no-permission' }
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      })
    } catch {
      // best-effort
    }
  }

  const token = await fetchExpoPushToken()
  if (!token || !EXPO_PUSH_TOKEN_REGEX.test(token)) {
    return { status: 'no-token' }
  }

  // Registro vía edge function. Antes el cliente escribía directo a
  // `push_subscriptions` y construía user_id + family_id en JS — un
  // binario modificado podía pasar cualquier cosa y quedaba solo
  // RLS como red de seguridad. F4 (red-team 2026-06-10): subimos el
  // gatekeeper al server, que resuelve userId con auth.getUser(token)
  // y familyId con un lookup en family_members.
  try {
    const sessionResponse = await supabase.auth.getSession()
    const accessToken = sessionResponse.data.session?.access_token
    if (!accessToken) {
      return { status: 'error' }
    }
    const { error } = await supabase.functions.invoke('register-push-subscription', {
      body: {
        token,
        provider: 'expo',
        userAgent: `${Platform.OS}/${Device.osVersion ?? 'unknown'}`,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (error) {
      return { status: 'error' }
    }
    return { status: 'ok', token }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Sprint H · H6 — Persistent queue for failed push-token cleanup.
 *
 * Threat:
 *   `tearDownPushNotifications` se llama en el logout. Si el device
 *   está offline (logout sin red) el DELETE falla y el token del user
 *   anterior queda registrado server-side. En un device compartido el
 *   próximo user recibe push intended for the prior user.
 *
 * Mitigación:
 *   Al fallar, guardamos `{ userId, queuedAt }` en SecureStore. Al
 *   próximo app launch + en cada auth state change `flushPendingPushTokenCleanup`
 *   reintenta el DELETE. Hasta que tenga éxito (eventual consistency).
 *
 * Se guarda un solo userId por vez — si encolamos otro user antes de
 * drenar, los stackeamos en un array. La key vive en SecureStore para
 * sobrevivir al kill/reinstall.
 */
const PENDING_PUSH_CLEANUP_KEY = 'pending-push-token-cleanup'

// Cap + age eviction live in `./push-cleanup-queue` so they can be unit
// tested under vitest without dragging in expo/react-native imports.
// Sprint I · I-3 — was unbounded growth.

async function readPendingCleanupQueue(): Promise<PendingCleanupEntry[]> {
  const raw = await getPersistentValue(PENDING_PUSH_CLEANUP_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is PendingCleanupEntry => {
      if (!entry || typeof entry !== 'object') return false
      const e = entry as Partial<PendingCleanupEntry>
      return typeof e.userId === 'string' && typeof e.queuedAt === 'number'
    })
  } catch {
    return []
  }
}

async function writePendingCleanupQueue(queue: PendingCleanupEntry[]): Promise<void> {
  if (queue.length === 0) {
    await deletePersistentValue(PENDING_PUSH_CLEANUP_KEY)
    return
  }
  await setPersistentValue(PENDING_PUSH_CLEANUP_KEY, JSON.stringify(queue))
}

async function enqueuePendingCleanup(userId: string): Promise<void> {
  const queue = await readPendingCleanupQueue()
  // Dedupe — si el mismo userId ya está en la cola no apilamos.
  if (queue.some((entry) => entry.userId === userId)) return
  queue.push({ userId, queuedAt: Date.now() })
  // Sprint I · I-3 — cap + age-evict before persisting so the queue
  // cannot grow unbounded on devices that never regain network.
  const pruned = pruneCleanupQueue(queue)
  await writePendingCleanupQueue(pruned)
}

async function tryDeletePushTokens(userId: string): Promise<boolean> {
  // Sprint J · J-Mobile1 — un DELETE con RLS-rejected NO devuelve error
  // en supabase-js (silenciosamente borra 0 filas) así que `!error` solo
  // no alcanza. Estrategia:
  //   1. SELECT primero para saber si hay algo que borrar y confirmar
  //      que la sesión actual puede ver las filas (si RLS bloquea, el
  //      SELECT también devuelve 0 — esto distingue "nada que limpiar"
  //      de "auth perdida").
  //   2. Si hay filas visibles, DELETE + `.select()` y comparamos.
  // El caller de tearDownPushNotifications debe correr ANTES de
  // signOut() (logout.ts) para que el JWT siga válido.
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'expo')
    if (selectErr) return false
    const existingCount = Array.isArray(existing) ? existing.length : 0
    // Nothing to clean up → vacuous success, no retry needed.
    if (existingCount === 0) return true

    const { data: deleted, error: deleteErr } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'expo')
      .select('id')
    if (deleteErr) return false
    const deletedCount = Array.isArray(deleted) ? deleted.length : 0
    // Si vimos N filas pero borramos menos, algo falló (RLS, race con
    // otro device). Encolamos retry.
    return deletedCount >= existingCount
  } catch {
    return false
  }
}

/**
 * Borra los tokens del usuario en el backend. Usado en logout para
 * que un device compartido no siga recibiendo push del user anterior.
 * Silencioso ante errores (el logout no debe fallar por esto) — pero
 * en caso de fallo encolamos el cleanup para reintentarlo más tarde
 * (Sprint H · H6).
 */
export async function tearDownPushNotifications(userId: string): Promise<void> {
  if (!userId) return
  const ok = await tryDeletePushTokens(userId)
  if (!ok) {
    try {
      await enqueuePendingCleanup(userId)
    } catch {
      // best-effort — si SecureStore tampoco responde, el flush en el
      // próximo launch no tendrá nada que drenar pero al menos no
      // bloqueamos el logout.
    }
  }
}

/**
 * Drena la cola de cleanups pendientes. Llamarlo:
 *   · en cold start (app/_layout, después de que el client de Supabase
 *     esté listo)
 *   · en cada `onAuthStateChange` (cuando recuperamos red post-logout)
 *
 * Las entradas que sigan fallando se mantienen en la cola para el
 * próximo intento. Las que tienen éxito se remueven.
 */
export async function flushPendingPushTokenCleanup(): Promise<void> {
  // Sprint I · I-3 — prune before flushing so we never retry an entry
  // older than 30 days, and so the working set fits the cap even if
  // a previous build wrote an unbounded queue.
  const queue = pruneCleanupQueue(await readPendingCleanupQueue())
  if (queue.length === 0) {
    await writePendingCleanupQueue(queue)
    return
  }
  const remaining: PendingCleanupEntry[] = []
  for (const entry of queue) {
    const ok = await tryDeletePushTokens(entry.userId)
    if (!ok) {
      remaining.push(entry)
    }
  }
  await writePendingCleanupQueue(remaining)
}
