import { useEffect } from 'react'
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

type ShareIntentModule = {
  useShareIntent: (options?: { debug?: boolean }) => {
    hasShareIntent: boolean
    shareIntent: {
      files: Array<{ path: string; mimeType: string | null }> | null
    } | null
    resetShareIntent: () => void
    error: string | null
  }
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

function ShareImportListenerNative({ mod }: { mod: ShareIntentModule }) {
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    mod.useShareIntent()

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
