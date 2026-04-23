import { useMutation, useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const DEFAULT_WEB_PUSH_PUBLIC_KEY =
  'BKZ67coFgS6TnsdNCNv3wmIsAtRROxoWAGBaPn6AEQxBcD9tLA0GDq5Ofsdz1nly28oPGIgTwfuvvZGrm8GG430'

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

function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
  const isIPadOSDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isIOSDevice || isIPadOSDesktopMode
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const standaloneMediaQuery =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const standaloneNavigatorFlag = navigatorWithStandalone.standalone === true

  return standaloneMediaQuery || standaloneNavigatorFlag
}

function getPushSupportError(): string | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Este dispositivo no soporta notificaciones push web.'
  }

  if (!window.isSecureContext) {
    return 'Las notificaciones push requieren HTTPS.'
  }

  if (!('Notification' in window)) {
    return 'Este navegador no soporta notificaciones web.'
  }

  if (!('serviceWorker' in navigator)) {
    return 'Este navegador no soporta service workers.'
  }

  if (!('PushManager' in window)) {
    if (isAppleMobileDevice() && !isStandaloneDisplayMode()) {
      return 'En iPhone/iPad abrí la app desde Pantalla de inicio (Safari > Compartir > Agregar a inicio).'
    }

    return 'Este dispositivo o navegador no soporta push web.'
  }

  if (isAppleMobileDevice() && !isStandaloneDisplayMode()) {
    return 'En iPhone/iPad abrí la app desde Pantalla de inicio (Safari > Compartir > Agregar a inicio).'
  }

  return null
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

      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('family_id', familyId)
        .eq('user_id', userId)
        .limit(1)

      if (error) {
        if (isMissingPushSubscriptionsTableError(error)) {
          return false
        }

        throw error
      }

      return (data?.length ?? 0) > 0
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

      const pushSupportError = getPushSupportError()
      if (pushSupportError) {
        throw new Error(pushSupportError)
      }

      const vapidPublicKey =
        import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() ||
        import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ||
        DEFAULT_WEB_PUSH_PUBLIC_KEY
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

      const serviceWorkerPath = `${import.meta.env.BASE_URL}push-sw.js`
      await navigator.serviceWorker.register(serviceWorkerPath, {
        scope: import.meta.env.BASE_URL,
      })
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
