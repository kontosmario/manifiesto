import { useMutation, useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function isMissingPushSubscriptionsTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  )
}

function base64ToUint8Array(base64Value: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Value.length % 4)) % 4)
  const normalized = (base64Value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

export const pushSubscriptionQueryKey = (familyId?: string, userId?: string) =>
  ['push-subscription', familyId, userId] as const

export function useHasPushSubscription(familyId?: string, userId?: string) {
  return useQuery<boolean>({
    queryKey: pushSubscriptionQueryKey(familyId, userId),
    enabled: Boolean(familyId && userId),
    queryFn: async () => {
      if (!familyId || !userId) {
        return false
      }

      const { count, error } = await supabase
        .from('push_subscriptions')
        .select('id', { head: true, count: 'exact' })
        .eq('family_id', familyId)
        .eq('user_id', userId)

      if (error) {
        if (isMissingPushSubscriptionsTableError(error)) {
          return false
        }

        throw error
      }

      return (count ?? 0) > 0
    },
  })
}

interface EnablePushInput {
  familyId: string
  userId: string
}

export function useEnablePushNotifications() {
  return useMutation({
    mutationFn: async ({ familyId, userId }: EnablePushInput) => {
      if (!familyId || !userId) {
        throw new Error('No hay familia o sesión activa para activar push.')
      }

      if (
        typeof window === 'undefined' ||
        typeof navigator === 'undefined' ||
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        throw new Error('Este dispositivo no soporta notificaciones push web.')
      }

      const vapidPublicKey =
        import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() ??
        import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
      if (!vapidPublicKey || typeof vapidPublicKey !== 'string') {
        throw new Error(
          'Falta configurar VITE_WEB_PUSH_PUBLIC_KEY (reiniciá el servidor o configuralo en el entorno de deploy).',
        )
      }

      const permissionResult =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()
      if (permissionResult !== 'granted') {
        throw new Error('Permiso de notificaciones no concedido.')
      }

      await navigator.serviceWorker.register('/push-sw.js')
      const registration = await navigator.serviceWorker.ready

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        })
      }

      const json = subscription.toJSON()
      const endpoint = json.endpoint ?? subscription.endpoint
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth

      if (!endpoint || !p256dh || !auth) {
        throw new Error('No se pudo obtener una suscripción push válida.')
      }

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          family_id: familyId,
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
        },
        {
          onConflict: 'user_id,endpoint',
        },
      )

      if (error) {
        if (isMissingPushSubscriptionsTableError(error)) {
          throw new Error('Falta correr la migración SQL para habilitar push.')
        }

        throw error
      }
    },
  })
}
