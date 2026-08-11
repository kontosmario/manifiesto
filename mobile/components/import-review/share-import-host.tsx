import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractionManager } from 'react-native'
import { ImportParsingOverlay } from '@/components/import-review/import-parsing-overlay'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { openImportFromUri } from '@/features/import-review/open-import-flow'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { useShareImportGate } from '@/features/share-import/use-share-import-gate'
import type { ReviewState } from '@/features/import-review/types'
import { toast } from '@/lib/toast-bus'

/**
 * Host del flujo share-to-import. Vive en el layout de tabs (solo
 * existe con sesión + app desbloqueada) y es dueño de SU instancia de
 * ImportReviewSheet — el tab button conserva la suya para el path del
 * picker; no comparten estado.
 *
 * Ciclo: gate entrega URI → overlay "Leyendo tu captura…" → OCR+parse
 * (openImportFromUri) → wizard. Cualquier error → toast y a idle.
 */
export function ShareImportHost() {
  const { t } = useTranslation()
  const { familyId, userId, makeMapContext } = useImportWizardContext()
  const [phase, setPhase] = useState<'idle' | 'parsing'>('idle')
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)

  const busy = phase === 'parsing' || reviewState !== null

  const handleShare = useCallback(
    (uri: string) => {
      setPhase('parsing')
      void (async () => {
        const result = await openImportFromUri(uri, makeMapContext())
        setPhase('idle')
        if (result.kind === 'opened') {
          // En warm-share el unlock (Face ID) recién terminó y su overlay
          // puede estar cerrándose. iOS DESCARTA silenciosamente un
          // <Modal> presentado mientras otro se dismissea (memoria del
          // proyecto: ios-modal-chain-dismiss; el FAB hace lo mismo con
          // el picker). Esperamos a que terminen las interacciones antes
          // de montar el wizard — esto era el "no inicia el flujo" del
          // device report 2026-06-12 v2: el OCR corría (la app se sentía
          // lenta) pero el Modal del wizard se descartaba.
          await new Promise<void>((resolve) => {
            InteractionManager.runAfterInteractions(() => resolve())
          })
          setReviewState(result.state)
          return
        }
        if (result.kind === 'error') {
          toast.error(t('gastos:shareImport.readError', { message: result.message }))
        }
      })()
    },
    [makeMapContext, t],
  )

  useShareImportGate({ familyId, userId, busy, onShare: handleShare })

  return (
    <>
      {phase === 'parsing' ? <ImportParsingOverlay /> : null}

      <ImportReviewSheet
        visible={reviewState !== null}
        initialState={reviewState}
        familyId={familyId ?? ''}
        userId={userId ?? ''}
        onClose={() => setReviewState(null)}
      />
    </>
  )
}
