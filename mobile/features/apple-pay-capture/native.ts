import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import type { PendingCapture } from './types'

interface ApplePayCaptureNativeModule {
  getPendingCaptures: () => PendingCapture[]
  clearCaptures: (ids: string[]) => void
  setNotificationCopy: (copy: { title: string; bodyTemplate: string }) => void
  setCaptureEnabled: (enabled: boolean) => void
}

// `requireOptionalNativeModule` devuelve null en vez de tirar cuando el
// módulo no está: Expo Go, web, y builds viejas anteriores a esta feature.
const native = requireOptionalNativeModule<ApplePayCaptureNativeModule>('ApplePayCapture')

/**
 * Sólo responde "¿existe el módulo nativo?" — es decir, si la build es lo
 * bastante nueva. La versión de iOS es un gate DISTINTO: el intent corre
 * desde iOS 16 pero el disparador "Transacción" existe recién en iOS 17,
 * y los dos casos le dicen cosas distintas al usuario ("actualizá la app"
 * contra "actualizá iOS").
 */
export function isApplePayCaptureSupported(): boolean {
  return Platform.OS === 'ios' && native !== null
}

export function getPendingCaptures(): PendingCapture[] {
  return native?.getPendingCaptures() ?? []
}

export function clearCaptures(ids: string[]): void {
  if (ids.length === 0) return
  native?.clearCaptures(ids)
}

export function setNotificationCopy(copy: { title: string; bodyTemplate: string }): void {
  native?.setNotificationCopy(copy)
}

/**
 * Baja al nativo el flag que el usuario controla desde Ajustes. El App
 * Intent corre en background, sin JS vivo, así que el único modo que
 * tiene de saber si la captura está prendida es este espejo en
 * `UserDefaults`. Sin él capturaba y notificaba siempre, aún apagado.
 */
export function setCaptureEnabled(enabled: boolean): void {
  native?.setCaptureEnabled(enabled)
}
