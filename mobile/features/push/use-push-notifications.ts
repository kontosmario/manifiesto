import { Platform } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { canUseNativePushNotifications } from '@/lib/runtime-environment'
import { supabase } from '@/lib/supabase'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

// Sentinel reconocible por la UI: cuando el binario sideloaded no
// trae el entitlement aps-environment (Apple ID gratis o cuenta sin
// Apple Developer Program), el error es estructural y la única salida
// es pagar los $99 + rebuild firmado. Lo distinguimos para mostrar
// un copy explicativo en vez de un toast genérico.
const APS_ENTITLEMENT_MISSING_MESSAGE =
  'Push en iOS requiere Apple Developer Program ($99/año) y un build firmado. Sin eso el binario no trae el entitlement aps-environment.'

export class MissingApsEntitlementError extends Error {
  readonly code = 'missing_aps_entitlement' as const
  constructor() {
    super(APS_ENTITLEMENT_MISSING_MESSAGE)
    this.name = 'MissingApsEntitlementError'
  }
}

export function isMissingApsEntitlementError(
  error: unknown,
): error is MissingApsEntitlementError {
  return error instanceof MissingApsEntitlementError
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
    throw new Error(
      'Las notificaciones push remotas requieren un development build. Expo Go ya no las soporta desde SDK 53.',
    )
  }

  if (!Device.isDevice) {
    throw new Error('Las notificaciones push requieren un dispositivo físico.')
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
    throw error
  }
  if (!tokenResponse.data) {
    throw new Error('No se pudo obtener un token push válido.')
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
        throw new Error('No hay familia o sesión activa para activar push.')
      }

      const token = await getExpoPushToken()

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          family_id: familyId,
          user_id: userId,
          provider: 'expo',
          endpoint: token,
          p256dh: 'expo',
          auth: 'expo',
          user_agent: `${Platform.OS}/${Device.osVersion ?? 'unknown'}`,
        },
        {
          onConflict: 'user_id,endpoint',
        },
      )

      if (error) {
        if (isMissingPushSubscriptionsTableError(error)) {
          throw new Error('Falta correr la migración SQL para habilitar push mobile.')
        }

        throw error
      }
    },
  })
}
