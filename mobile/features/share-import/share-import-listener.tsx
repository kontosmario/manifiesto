import { useEffect } from 'react'
import { AppState, Linking } from 'react-native'
import { isExpoGo } from '@/lib/runtime-environment'
import { setPendingShare } from '@/features/share-import/pending-share-store'
import { toast } from '@/lib/toast-bus'

/**
 * Puente root → pending-share-store. Envuelve useShareIntent() de
 * expo-share-intent, que SOLO existe en builds nativas (dev client /
 * TestFlight). En Expo Go el módulo nativo no está linkeado: el guard
 * de require + isExpoGo convierte todo en no-op para que la app bootee
 * (mismo trato que ML Kit en activity-ocr).
 */

type NativeShareModule = {
  getShareIntent: (url: string) => unknown
}

type ShareIntentModule = {
  useShareIntent: (options?: { debug?: boolean }) => {
    hasShareIntent: boolean
    shareIntent: {
      files: Array<{ path: string; mimeType: string | null }> | null
    } | null
    resetShareIntent: () => void
    error: string | null
  }
  /** Acceso directo al módulo nativo (AsyncFunction getShareIntent). */
  ShareIntentModule?: NativeShareModule | null
}

const shareIntentModule: ShareIntentModule | null = (() => {
  if (isExpoGo) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-share-intent') as ShareIntentModule
  } catch {
    return null
  }
})()

export function ShareImportListenerBridge() {
  if (!shareIntentModule) return null
  return <ShareImportListenerNative mod={shareIntentModule} />
}

/** El share extension relanza la app con `<scheme>://dataUrl=<key>#media`. */
const SHARE_URL_MARKER = 'dataUrl='

function ShareImportListenerNative({ mod }: { mod: ShareIntentModule }) {
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    mod.useShareIntent()

  // ── Warm-share fix (device report 2026-06-12) ─────────────────────
  // Con la app abierta, compartir una captura NO arrancaba el flujo.
  // La entrega de la imagen depende ENTERAMENTE de que JS llame a
  // `getShareIntent(url)`; la lib la dispara desde `useLinkingURL()`,
  // pero en warm ese URL (a) lo consume/redirige expo-router vía
  // `+native-intent.ts`, o (b) es idéntico al del share anterior (la
  // key es constante) y React no detecta cambio → la cadena no
  // arranca. El evento `Linking` CRUDO de React Native es multicast y
  // NO pasa por el redirect de expo-router, así que lo usamos para
  // forzar el re-read del App Group en cada URL de share + en cada
  // foreground. El resultado vuelve por el `onChange` del hook → el
  // effect de abajo lo procesa. Idempotente: el store es un slot único.
  useEffect(() => {
    const native = mod.ShareIntentModule
    if (!native?.getShareIntent) return

    const pump = (url: string | null | undefined) => {
      if (url && url.includes(SHARE_URL_MARKER)) {
        try {
          native.getShareIntent(url)
        } catch {
          // handleUrl nativo devuelve "error"/"empty" sin emitir para
          // URLs no-share; cualquier throw acá es no-fatal.
        }
      }
    }

    // Cold / ya-presente al montar.
    void Linking.getInitialURL().then(pump)

    // Warm: cada deep link nuevo (incluido el mismo URL repetido).
    const urlSub = Linking.addEventListener('url', (e) => pump(e.url))

    // Foreground: por si el share llega sin re-emitir el evento `url`
    // (mismo string que la vez anterior) — re-leemos el App Group.
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void Linking.getInitialURL().then(pump)
    })

    return () => {
      urlSub.remove()
      appSub.remove()
    }
  }, [mod])

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return
    const files = shareIntent.files ?? []
    const images = files.filter((f) =>
      (f.mimeType ?? '').startsWith('image/'),
    )
    if (images.length === 0) {
      // Android puede dejar pasar tipos no-imagen (filter laxo).
      toast.error('Solo puedo importar capturas de pantalla.')
      resetShareIntent()
      return
    }
    if (images.length > 1) {
      toast.info('Procesamos la primera captura — de a una por ahora.')
    }
    const raw = images[0].path
    const uri = raw.startsWith('file://') ? raw : `file://${raw}`
    setPendingShare(uri)
    resetShareIntent()
  }, [hasShareIntent, shareIntent, resetShareIntent])

  useEffect(() => {
    if (error) toast.error('No pude recibir esa captura. Probá de nuevo.')
  }, [error])

  return null
}
