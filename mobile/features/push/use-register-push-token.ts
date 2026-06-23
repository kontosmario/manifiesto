import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setupPushNotifications } from '@/lib/push-notifications'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { pushSubscriptionQueryKey } from '@/features/push/use-push-notifications'

// Bounded retry for TRANSIENT registration failures (network blip, edge
// function 5xx). Push audit (2026-06-15): the previous version stamped a
// "ya lo intentamos" key BEFORE the attempt and only cleared it on
// success — so a single transient failure left the device unregistered
// until the next cold start. Now we only remember SUCCESS, and retry
// `error` outcomes a few times with linear backoff.
const MAX_REGISTER_ATTEMPTS = 4
const RETRY_BASE_MS = 4000

/**
 * Hook side-effect que registra el token Expo Push del device en
 * `push_subscriptions` cada vez que aparece un userId activo (post
 * login / refresh / cold start). No pide permisos por sí mismo: el
 * priming de `onboarding-success-screen` y el toggle de Settings son
 * los puntos de entrada del prompt nativo. Acá sólo "completamos"
 * el registro si el permiso ya fue concedido.
 *
 * Reintentos (push audit 2026-06-15): sólo memorizamos el (user, family)
 * que registró OK. Un fallo transitorio (`status: 'error'`) reintenta
 * hasta MAX_REGISTER_ATTEMPTS con backoff lineal en vez de quedar
 * bloqueado hasta el próximo cold start. Los estados terminales del
 * lifecycle (`no-permission`, `no-token`, `not-supported`) no se
 * reintentan: un cambio de permiso/familia dispara un effect nuevo.
 *
 * Rotación de token: Expo rota tokens ocasionalmente (cambio de versión
 * del backend de expo-push, restore desde backup). `addPushTokenListener`
 * re-registra el token nuevo en el acto, sin esperar al próximo cold
 * start. El upsert ON CONFLICT (user_id, endpoint) mete el nuevo y el
 * viejo se purga vía poda de tokens muertos (DeviceNotRegistered) +
 * retención 90d.
 *
 * Invalidamos `pushSubscriptionQueryKey(familyId, userId)` tras cada
 * setup OK para que el banner "Activar push" de Settings refleje el
 * estado real sin un reload.
 */
export function useRegisterPushToken(
  userId: string | null | undefined,
  familyId: string | null | undefined,
): void {
  const queryClient = useQueryClient()
  const lastSuccessKey = useRef<string | null>(null)
  // Fix del flood de register-push (audit 2026-06-23). Dos guardas que
  // rompen el loop `getExpoPushTokenAsync → addPushTokenListener → run`:
  //   · `inFlight`: nunca solapar dos registros (ver `run`).
  //   · `lastDeviceToken`: re-registrar solo ante rotación REAL del token
  //     (ver el `addPushTokenListener` abajo).
  const inFlight = useRef(false)
  const lastDeviceToken = useRef<string | null>(null)

  useEffect(() => {
    if (!canUseNativePushNotifications) return
    if (!userId) return

    const attemptKey = `${userId}:${familyId ?? 'no-family'}`
    // Saltamos sólo si YA registramos OK este exacto (user, familia).
    // Un fallo previo NO debe bloquear el reintento.
    if (lastSuccessKey.current === attemptKey) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = async (attempt: number): Promise<void> => {
      // Guard de concurrencia: jamás dejar dos registros solapados. La
      // causa raíz del flood (audit 2026-06-23): `setupPushNotifications`
      // llama `getExpoPushTokenAsync`, que re-emite el device token vía
      // `addPushTokenListener` → re-entra acá → fan-out de decenas de
      // invokes concurrentes → 429 auto-infligido. Con el guard, las
      // re-entradas durante un registro en vuelo se descartan (no se
      // encolan), así el loop muere en una iteración.
      if (inFlight.current) return
      inFlight.current = true
      try {
        const result = await setupPushNotifications({
          userId,
          familyId: familyId ?? null,
        })
        if (cancelled) return
        if (result.status === 'ok') {
          lastSuccessKey.current = attemptKey
          await queryClient.invalidateQueries({
            queryKey: pushSubscriptionQueryKey(familyId ?? undefined, userId),
          })
          return
        }
        // Solo 'error' (transitorio) se reintenta. El resto es terminal
        // para este lifecycle.
        if (result.status === 'error' && attempt < MAX_REGISTER_ATTEMPTS) {
          timer = setTimeout(() => {
            void run(attempt + 1)
          }, RETRY_BASE_MS * attempt)
        }
      } finally {
        inFlight.current = false
      }
    }

    void run(1)

    // Re-registro inmediato ante rotación del token Expo.
    let removeListener: (() => void) | null = null
    void (async () => {
      const Notifications = await import('expo-notifications')
      if (cancelled) return
      const subscription = Notifications.addPushTokenListener((deviceToken) => {
        // Solo re-registrar ante una rotación REAL del token. expo-
        // notifications re-emite el token actual cada vez que corre
        // `getExpoPushTokenAsync` (que nuestro propio setup llama) — sin
        // este dedupe el listener re-entra a `run` → getExpoPushTokenAsync
        // → listener → ... el loop apretado que floodeaba register-push
        // (audit 2026-06-23). Comparamos contra el último device token
        // visto y descartamos los re-emits idénticos.
        const next =
          typeof deviceToken?.data === 'string' ? deviceToken.data : null
        if (next && next === lastDeviceToken.current) return
        lastDeviceToken.current = next
        // Forzamos un registro fresco con el token rotado.
        lastSuccessKey.current = null
        if (timer) clearTimeout(timer)
        void run(1)
      })
      removeListener = () => subscription.remove()
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (removeListener) removeListener()
    }
  }, [userId, familyId, queryClient])
}
