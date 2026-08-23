import { Platform } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

// Sentinel reconocible por la UI: cuando el binario sideloaded no
// trae el entitlement aps-environment (Apple ID gratis o cuenta sin
// Apple Developer Program), el error es estructural y la única salida
// es pagar los $99 + rebuild firmado. Lo distinguimos para mostrar
// un copy explicativo en vez de un toast genérico. El mensaje se
// resuelve en el momento del throw (no a module-load) para tomar el
// idioma activo. El matcher (looksLikeApsEntitlementFailure) inspecciona
// el mensaje del OS, no este copy → localizarlo es seguro.
export class MissingApsEntitlementError extends Error {
  readonly code = 'missing_aps_entitlement' as const
  constructor() {
    super(i18n.t('errors:push.missingApsEntitlement'))
    this.name = 'MissingApsEntitlementError'
  }
}

export function isMissingApsEntitlementError(
  error: unknown,
): error is MissingApsEntitlementError {
  return error instanceof MissingApsEntitlementError
}

// Contraparte Android del sentinel de arriba: sin google-services.json
// (FCM no configurado en el build) `getExpoPushTokenAsync` lanza el error
// de Firebase sin inicializar. También es estructural — la salida es un
// build con FCM cableado — así que merece copy explicativo en vez del
// stacktrace crudo de Firebase en un toast (gap de la auditoría Android
// 2026-08-18).
export class MissingFcmConfigError extends Error {
  readonly code = 'missing_fcm_config' as const
  constructor() {
    super(i18n.t('errors:push.missingFcmConfig'))
    this.name = 'MissingFcmConfigError'
  }
}

export function isMissingFcmConfigError(error: unknown): error is MissingFcmConfigError {
  return error instanceof MissingFcmConfigError
}

function looksLikeMissingFcmConfigFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  const lower = message.toLowerCase()
  return (
    // Mensajes de Firebase/expo-notifications cuando el build no trae
    // google-services.json: "Default FirebaseApp is not initialized" /
    // "Make sure to call FirebaseApp.initializeApp" / menciones directas
    // al archivo de config.
    lower.includes('firebaseapp is not initialized') ||
    lower.includes('default firebaseapp') ||
    lower.includes('google-services') ||
    (lower.includes('firebase') && lower.includes('initial'))
  )
}

function looksLikeApsEntitlementFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  const lower = message.toLowerCase()
  return (
    lower.includes('aps-environment') ||
    lower.includes('aps environment') ||
    // Mensajes alternativos de expo-notifications cuando no encuentra
    // el entitlement: "no valid 'aps-environment'" / variaciones
    (lower.includes('aps') && lower.includes('environment'))
  )
}

export const supportsRemotePushNotifications = canUseNativePushNotifications

function isMissingPushSubscriptionsTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  )
}

async function getExpoPushToken(): Promise<string> {
  if (!supportsRemotePushNotifications) {
    throw new Error(i18n.t('errors:push.needsDevBuild'))
  }

  if (!Device.isDevice) {
    throw new Error(i18n.t('errors:push.needsPhysicalDevice'))
  }

  const Notifications = await import('expo-notifications')

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const permissionResult = await Notifications.requestPermissionsAsync()
    finalStatus = permissionResult.status
  }

  if (finalStatus !== 'granted') {
    throw new Error('Permiso de notificaciones no concedido.')
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    })
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null

  if (!projectId) {
    throw new Error(
      'Falta EXPO_PUBLIC_EAS_PROJECT_ID para registrar el token push del proyecto.',
    )
  }

  let tokenResponse: { data?: string }
  try {
    tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId })
  } catch (error) {
    if (Platform.OS === 'ios' && looksLikeApsEntitlementFailure(error)) {
      throw new MissingApsEntitlementError()
    }
    if (Platform.OS === 'android' && looksLikeMissingFcmConfigFailure(error)) {
      throw new MissingFcmConfigError()
    }
    throw error
  }
  if (!tokenResponse.data) {
    throw new Error(i18n.t('errors:push.tokenUnavailable'))
  }

  return tokenResponse.data
}

export const pushSubscriptionQueryKey = (familyId?: string, userId?: string) =>
  ['push-subscription', familyId, userId] as const

export function useHasPushSubscription(familyId?: string, userId?: string) {
  return useQuery<boolean>({
    queryKey: pushSubscriptionQueryKey(familyId, userId),
    enabled: Boolean(familyId && userId && supportsRemotePushNotifications),
    queryFn: async () => {
      if (!familyId || !userId || !supportsRemotePushNotifications) {
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
        throw new Error(i18n.t('errors:push.noFamilyOrSession'))
      }

      const token = await getExpoPushToken()

      // Registro vía edge function (F4 red-team 2026-06-10). Antes el
      // cliente escribía directo a push_subscriptions con user_id +
      // family_id construidos en JS; ahora el server los resuelve.
      // familyId / userId del input se mantienen solo para validar
      // estado del shell antes de pedir el token al OS — el server
      // ignora cualquier valor que el cliente envíe.
      const sessionResponse = await supabase.auth.getSession()
      const accessToken = sessionResponse.data.session?.access_token
      if (!accessToken) {
        throw new Error(i18n.t('errors:push.noSessionRegister'))
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
        throw error
      }
    },
  })
}
