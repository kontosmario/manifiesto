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
 *
 * ── Entrega del share: 3 canales (device report 2026-06-12 v2) ──────
 * La extensión guarda la imagen en el App Group y abre el host con
 * `manifiesto://dataUrl=manifiestoShareKey#media` vía el hack del
 * responder-chain — cuya entrega del evento de URL al host YA CORRIENDO
 * es flaky. La imagen, en cambio, SIEMPRE queda en el App Group. Por eso:
 *   1. Evento `Linking` crudo (multicast, no lo intercepta expo-router):
 *      cubre cold y los warm donde iOS sí entrega el evento.
 *   2. **Poll en foreground con URL sintetizada**: en cada `active`
 *      llamamos getShareIntent con la URL canónica — el nativo lee el
 *      App Group directo y responde "empty" gratis si no hay nada.
 *      CERO dependencia de eventos: aunque iOS no entregue la URL, el
 *      share se levanta al volver la app al frente. (El intento anterior
 *      usaba getInitialURL(), que es null si la app no fue LANZADA por
 *      una URL → el fallback nunca corría con la app abierta.)
 *   3. Poll inicial al montar (cold sin evento).
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
  ShareIntentModule?: NativeShareModule | null
  getShareExtensionKey?: () => string
  getScheme?: () => string | null
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

const SHARE_URL_MARKER = 'dataUrl='

/** URL canónica que el handleUrl nativo espera para media. El scheme y
 *  la key se resuelven de la lib (con fallback hardcodeado idéntico al
 *  que genera el config plugin). */
function syntheticMediaUrl(mod: ShareIntentModule): string {
  const scheme = mod.getScheme?.() ?? 'manifiesto'
  const key = mod.getShareExtensionKey?.() ?? `${scheme}ShareKey`
  return `${scheme}://${SHARE_URL_MARKER}${key}#media`
}

function ShareImportListenerNative({ mod }: { mod: ShareIntentModule }) {
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    mod.useShareIntent()

  useEffect(() => {
    const native = mod.ShareIntentModule
    if (!native?.getShareIntent) return

    // Poll directo del App Group. "empty" no emite evento → gratis.
    const poll = () => {
      try {
        native.getShareIntent(syntheticMediaUrl(mod))
      } catch {
        // no-fatal: el handleUrl nativo devuelve "error"/"empty" sin
        // emitir para URLs que no resuelven.
      }
    }

    // Canal 3: cold/mount sin evento.
    poll()

    // Canal 1: evento crudo (cubre cuando iOS sí lo entrega). Si la URL
    // del share trae otro fragment (#text/#weburl) la pasamos tal cual.
    const urlSub = Linking.addEventListener('url', (e) => {
      if (e.url && e.url.includes(SHARE_URL_MARKER)) {
        try {
          native.getShareIntent(e.url)
        } catch {
          // no-fatal
        }
      }
    })

    // Canal 2: poll en cada foreground — la red de seguridad que NO
    // depende de que iOS entregue el evento de URL al host corriendo.
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') poll()
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
    // El store dedupea re-entregas del mismo share (la lib puede emitir
    // onChange dos veces: refresh propio + nuestro poll).
    setPendingShare(uri)
    resetShareIntent()
  }, [hasShareIntent, shareIntent, resetShareIntent])

  useEffect(() => {
    if (error) toast.error('No pude recibir esa captura. Prueba de nuevo.')
  }, [error])

  return null
}
