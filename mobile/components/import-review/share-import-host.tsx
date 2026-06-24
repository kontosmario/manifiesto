import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  Text,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
} from 'react-native-reanimated'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { openImportFromUri } from '@/features/import-review/open-import-flow'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { useShareImportGate } from '@/features/share-import/use-share-import-gate'
import type { ReviewState } from '@/features/import-review/types'
import { toast } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Host del flujo share-to-import. Vive en el layout de tabs (solo
 * existe con sesión + app desbloqueada) y es dueño de SU instancia de
 * ImportReviewSheet — el tab button conserva la suya para el path del
 * picker; no comparten estado.
 *
 * Ciclo: gate entrega URI → overlay "Leyendo tu captura…" → OCR+parse
 * (openImportFromUri) → wizard. Cualquier error → toast y a idle.
 */
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

export function ShareImportHost() {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
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
          toast.error(`No pude leer esa captura: ${result.message}`)
        }
      })()
    },
    [makeMapContext],
  )

  useShareImportGate({ familyId, userId, busy, onShare: handleShare })

  return (
    <>
      {phase === 'parsing' ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(180).easing(EASE_IOS)}
          exiting={reduced ? undefined : FadeOut.duration(160).easing(EASE_IOS)}
          style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
          pointerEvents="auto"
        >
          <Animated.View
            entering={
              reduced ? undefined : FadeInDown.duration(220).easing(EASE_IOS)
            }
            style={[
              styles.card,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Leyendo tu captura…
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}

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

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
})
