/**
 * Política de arranque del SDK de Meta (atribución de app ads + SKAdNetwork).
 *
 * PURA: toda la IO nativa entra inyectada (mismo patrón que rate-app.ts) para
 * testear el orden y los bordes sin mockear módulos nativos. El cableado real
 * (expo-tracking-transparency + react-native-fbsdk-next + AppState) vive en
 * meta-sdk.ts.
 *
 * Orden (spec 2026-08-23):
 *   1. esperar a que la app esté en foreground — iOS 15+ sólo muestra el
 *      prompt de ATT con la app `active`; pedido antes, queda mudo.
 *   2. requestTrackingPermissionsAsync()
 *   3. Settings.initializeSDK()
 *   4. Settings.setAdvertiserTrackingEnabled(status === 'granted')
 *   5. Settings.setAutoLogAppEventsEnabled(true)
 *
 * Un ATT denegado (o un pedido que falla) NO frena el SDK: la atribución por
 * SKAdNetwork no usa el IDFA, sólo cambia qué se le anexa a los eventos. Un
 * fallo nativo tampoco propaga: la medición jamás puede tirar la app.
 */

export interface MetaSdkIo {
  /** Resuelve cuando la app está en foreground (`AppState === 'active'`). */
  waitForActiveApp: () => Promise<void>
  /** `requestTrackingPermissionsAsync()` de expo-tracking-transparency. */
  requestTrackingPermission: () => Promise<{ status: string }>
  /** `Settings.initializeSDK()` de react-native-fbsdk-next. */
  initializeSDK: () => void | Promise<void>
  /** `Settings.setAdvertiserTrackingEnabled(bool)` — iOS 14+; no-op en Android. */
  setAdvertiserTrackingEnabled: (enabled: boolean) => unknown
  /** `Settings.setAutoLogAppEventsEnabled(bool)`. */
  setAutoLogAppEventsEnabled: (enabled: boolean) => void | Promise<void>
  /** Reporte de fallas no fatales (en dev, un warn en consola). */
  onError?: (error: unknown) => void
}

export interface MetaSdkEnv {
  /** `Platform.OS`. */
  platform: string
  /** Expo Go no linkea react-native-fbsdk-next: llamar al SDK ahí crashea. */
  isExpoGo: boolean
}

export type MetaSdkInitResult =
  | { outcome: 'skipped'; reason: 'web' | 'expo-go' }
  | {
      outcome: 'initialized'
      /** Estado de ATT tal como lo devuelve expo (`granted`/`denied`/…); `unavailable` si el pedido falló. */
      trackingStatus: string
      advertiserTrackingEnabled: boolean
    }
  | { outcome: 'failed'; error: unknown }

export async function runMetaSdkInit(io: MetaSdkIo, env: MetaSdkEnv): Promise<MetaSdkInitResult> {
  if (env.platform === 'web') return { outcome: 'skipped', reason: 'web' }
  if (env.isExpoGo) return { outcome: 'skipped', reason: 'expo-go' }

  try {
    await io.waitForActiveApp()

    let trackingStatus = 'unavailable'
    try {
      trackingStatus = (await io.requestTrackingPermission()).status
    } catch (error) {
      // Sin respuesta de ATT se asume NO concedido; el SDK arranca igual.
      io.onError?.(error)
    }
    const advertiserTrackingEnabled = trackingStatus === 'granted'

    await io.initializeSDK()
    await io.setAdvertiserTrackingEnabled(advertiserTrackingEnabled)
    await io.setAutoLogAppEventsEnabled(true)

    return { outcome: 'initialized', trackingStatus, advertiserTrackingEnabled }
  } catch (error) {
    io.onError?.(error)
    return { outcome: 'failed', error }
  }
}

/**
 * Envuelve la política en un arranque ÚNICO por runtime JS: remounts del
 * root, StrictMode y hot reload comparten la misma promesa. Un runtime que
 * salteó (web / Expo Go) tampoco reintenta.
 */
export function createMetaSdkInitializer(
  io: MetaSdkIo,
  env: MetaSdkEnv,
): () => Promise<MetaSdkInitResult> {
  let pending: Promise<MetaSdkInitResult> | null = null
  return () => {
    pending ??= runMetaSdkInit(io, env)
    return pending
  }
}
