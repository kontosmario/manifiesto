import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { NeoSurface } from '@/components/ui/neo-surface'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { openImportFromUri } from '@/features/import-review/open-import-flow'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { useShareImportGate } from '@/features/share-import/use-share-import-gate'
import type { ReviewState } from '@/features/import-review/types'
import { toast } from '@/lib/toast-bus'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

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

/**
 * El handoff pinta el scrim como un sólido porque en la maqueta el
 * fondo ya viene lavado. Acá hay una pantalla real atrás, así que se
 * aplica el MISMO tono con alfa — misma decisión (y mismo valor) que
 * la carcasa neo de `ModalCard`.
 */
const NEO_SCRIM_ALPHA = 0.84

export function ShareImportHost() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
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
          toast.error(t('gastos:shareImport.readError', { message: result.message }))
        }
      })()
    },
    [makeMapContext, t],
  )

  useShareImportGate({ familyId, userId, busy, onShare: handleShare })

  return (
    <>
      {phase === 'parsing' ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(180).easing(EASE_IOS)}
          exiting={reduced ? undefined : FadeOut.duration(160).easing(EASE_IOS)}
          style={[
            styles.overlay,
            { backgroundColor: withAlpha(neo.scrim, NEO_SCRIM_ALPHA) },
          ]}
          pointerEvents="auto"
        >
          <Animated.View
            entering={
              reduced ? undefined : FadeInDown.duration(220).easing(EASE_IOS)
            }
          >
            {/* La card tiene fill propio (gradiente `raised` del tema),
                así que sobrevive a un Android < API 28 que descarta el
                boxShadow outset: pierde el relieve, no la lectura. */}
            <NeoSurface
              variant="raisedLg"
              radius={neoRadii.cardSm}
              style={styles.card}
            >
              <ActivityIndicator color={neo.green} />
              <Text style={[styles.label, { color: neo.text }]}>
                {t('gastos:shareImport.reading')}
              </Text>
            </NeoSurface>
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
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 800 se renderiza como regular.
  label: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
