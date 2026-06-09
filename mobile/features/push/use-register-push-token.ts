import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setupPushNotifications } from '@/lib/push-notifications'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { pushSubscriptionQueryKey } from '@/features/push/use-push-notifications'

/**
 * Hook side-effect que registra el token Expo Push del device en
 * `push_subscriptions` cada vez que aparece un userId activo (post
 * login / refresh / cold start). No pide permisos por sí mismo: el
 * priming de `onboarding-success-screen` y el toggle de Settings son
 * los puntos de entrada del prompt nativo. Acá sólo "completamos"
 * el registro si el permiso ya fue concedido.
 *
 * Por qué un hook y no una mutation:
 *   - El registro es idempotente (upsert por user_id+endpoint) y
 *     no necesita UI feedback. Sólo nos importa que el token esté
 *     vigente para que `send-family-push` lo pueda usar.
 *   - Lo queremos automático en cada mount con userId — un hook con
 *     useEffect es la primitiva natural.
 *
 * Re-registro: Expo rota tokens ocasionalmente (cambio de version
 * del expo-push backend, restore desde backup). El upsert ON CONFLICT
 * mete el nuevo token sin pisar el viejo si coincide, así que las
 * filas viven hasta que el cron de retención (90d sin last_used_at)
 * las purga.
 *
 * Invalidamos la query `pushSubscriptionQueryKey(familyId, userId)`
 * después de cada setup OK para que el banner "Activar push" de
 * Settings reflecte el estado real sin un reload.
 */
export function useRegisterPushToken(
  userId: string | null | undefined,
  familyId: string | null | undefined,
): void {
  const queryClient = useQueryClient()
  const lastAttemptKey = useRef<string | null>(null)

  useEffect(() => {
    if (!canUseNativePushNotifications) return
    if (!userId) return

    // Key de "ya lo intentamos en este lifecycle" para evitar
    // hammering del backend si `familyId` cambia 3 veces rápido por
    // un re-render. El registro real igual es idempotente, pero
    // ahorramos round-trips innecesarios.
    const attemptKey = `${userId}:${familyId ?? 'no-family'}`
    if (lastAttemptKey.current === attemptKey) return
    lastAttemptKey.current = attemptKey

    let cancelled = false

    void (async () => {
      const result = await setupPushNotifications({
        userId,
        familyId: familyId ?? null,
      })
      if (cancelled) return
      if (result.status === 'ok') {
        await queryClient.invalidateQueries({
          queryKey: pushSubscriptionQueryKey(familyId ?? undefined, userId),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, familyId, queryClient])
}
