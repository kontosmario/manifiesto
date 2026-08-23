/**
 * SDK de Meta (Facebook) — cableado real de la política de meta-sdk-init.ts.
 *
 * `initMetaSDK()` se llama UNA vez desde el root (root-layout-shell), después
 * del primer render; adentro queda memoizado, así que llamarlo de nuevo es
 * gratis. Sólo medición de app ads (fb_mobile_activate_app automático +
 * SKAdNetwork): NO hay login con Facebook ni eventos propios.
 *
 * En iOS el SDK además se inicializa NATIVAMENTE en el AppDelegate
 * (plugins/with-meta-sdk-app-delegate.cjs): el activate del arranque en frío
 * sólo se loguea si el SDK ya existe cuando llega el primer
 * `applicationDidBecomeActive`, y JS corre siempre después de eso. El
 * `Settings.initializeSDK()` de acá queda idempotente en iOS y es el camino
 * de Android.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native'
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency'
import { isExpoGo } from '@/lib/runtime-environment'
import { createMetaSdkInitializer, type MetaSdkIo } from './meta-sdk-init'

type FbSettings = (typeof import('react-native-fbsdk-next'))['Settings']

// Import diferido: el índice de react-native-fbsdk-next toca NativeModules al
// cargar (login, share, etc. que no usamos). Sólo se paga cuando la política
// decidió que este runtime sí tiene el módulo nativo.
let settingsPromise: Promise<FbSettings> | null = null
function loadSettings(): Promise<FbSettings> {
  settingsPromise ??= import('react-native-fbsdk-next').then((module) => module.Settings)
  return settingsPromise
}

/**
 * `unknown` (primer tick de algunos arranques) y `active` pasan directo: sólo
 * se espera si la app está de verdad en background/inactive (p.ej. abierta
 * por una notificación en segundo plano).
 */
function waitForActiveApp(): Promise<void> {
  const state = AppState.currentState
  if (state !== 'background' && state !== 'inactive') return Promise.resolve()
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return
      subscription.remove()
      resolve()
    })
  })
}

const io: MetaSdkIo = {
  waitForActiveApp,
  requestTrackingPermission: () => requestTrackingPermissionsAsync(),
  initializeSDK: async () => {
    ;(await loadSettings()).initializeSDK()
  },
  setAdvertiserTrackingEnabled: async (enabled) => {
    await (await loadSettings()).setAdvertiserTrackingEnabled(enabled)
  },
  setAutoLogAppEventsEnabled: async (enabled) => {
    ;(await loadSettings()).setAutoLogAppEventsEnabled(enabled)
  },
  onError: (error) => {
    if (__DEV__) console.warn('[meta-sdk] la inicialización del SDK de Meta falló', error)
  },
}

export const initMetaSDK = createMetaSdkInitializer(io, {
  platform: Platform.OS,
  isExpoGo,
})
