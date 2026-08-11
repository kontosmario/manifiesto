import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { ModalCard } from '@/components/ui/modal-card'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { NeoButton } from '@/components/ui/neo-button'
import { useWellStyle } from '@/components/billing/billing-neo-kit'
import { motionDurations, motionSprings } from '@/lib/motion'
import { neoInk } from '@/theme/neo-ink'
import { neoParticlePresets, neoRadii } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Resultado de compra/restore como sheet on-brand (reemplaza los Alert
 * nativos). `success` es el momento celebratorio: Brot festejando sobre un
 * pozo con luciérnagas del preset de celebración + confetti, con la entrada
 * en escala 0.9→1 (NUNCA scale(0)). Respeta reduced-motion. El gotcha de
 * modal-chain (presentar tras cerrarse la hoja de StoreKit) lo maneja el host
 * con `presentAfterNativeUI`.
 */
export type PurchaseResultVariant =
  | 'success'
  | 'planChanged'
  | 'error'
  | 'restored'
  | 'restoreError'

export interface PurchaseResultSheetProps {
  visible: boolean
  variant: PurchaseResultVariant
  planName?: string
  reason?: string
  onClose: () => void
  onRetry?: () => void
}

type TFn = ReturnType<typeof useTranslation>['t']

/** Copy localizado por variante. `body` resuelve plan/motivo en runtime. */
function copyFor(
  variant: PurchaseResultVariant,
  t: TFn,
): { title: string; body: (planName?: string, reason?: string) => string } {
  switch (variant) {
    case 'success':
      return {
        title: t('billing:purchaseResult.successTitle'),
        body: (planName) =>
          t('billing:purchaseResult.successBody', {
            plan: planName ?? t('billing:purchaseResult.successBodyFallbackPlan'),
          }),
      }
    case 'planChanged':
      return {
        title: t('billing:purchaseResult.planChangedTitle'),
        body: () => t('billing:purchaseResult.planChangedBody'),
      }
    case 'restored':
      return {
        title: t('billing:purchaseResult.restoredTitle'),
        body: () => t('billing:purchaseResult.restoredBody'),
      }
    case 'error':
      return {
        title: t('billing:purchaseResult.errorTitle'),
        body: (_p, reason) => reason ?? t('billing:purchaseResult.errorBody'),
      }
    case 'restoreError':
      return {
        title: t('billing:purchaseResult.restoreErrorTitle'),
        body: (_p, reason) =>
          reason ?? t('billing:purchaseResult.restoreErrorBody'),
      }
  }
}

export const PurchaseResultSheet = memo(function PurchaseResultSheet({
  visible,
  variant,
  planName,
  reason,
  onClose,
  onRetry,
}: PurchaseResultSheetProps) {
  const { t } = useTranslation()
  const copy = copyFor(variant, t)
  const isCelebration = variant === 'success'
  const ctaLabel =
    variant === 'success'
      ? t('billing:purchaseResult.ctaStart')
      : variant === 'planChanged'
        ? t('billing:purchaseResult.ctaUnderstood')
        : t('billing:purchaseResult.ctaDone')

  const footer = isError(variant) ? (
    <View style={styles.footerCol}>
      {onRetry ? (
        <NeoButton
          fullWidth
          label={t('billing:purchaseResult.retry')}
          onPress={onRetry}
          variant="primary"
        />
      ) : null}
      <NeoButton
        fullWidth
        label={t('billing:purchaseResult.close')}
        onPress={onClose}
        variant="ghost"
      />
    </View>
  ) : (
    <NeoButton fullWidth label={ctaLabel} onPress={onClose} variant="primary" />
  )

  return (
    <ModalCard
      footer={footer}
      onClose={onClose}
      skin="neo"
      subtitle={copy.body(planName, reason)}
      title={copy.title}
      visible={visible}
    >
      <View style={styles.body}>
        {isCelebration ? (
          <CelebrationMark visible={visible} />
        ) : (
          <SimpleMark variant={variant} />
        )}
      </View>
    </ModalCard>
  )
})

function isError(v: PurchaseResultVariant): boolean {
  return v === 'error' || v === 'restoreError'
}

/**
 * Brot festejando sobre un pozo con luciérnagas + confetti.
 *
 * La entrada se dispara con `visible`, no en el montaje: el sheet vive montado
 * durante toda la vida de la pantalla (el host solo conmuta `visible`), así
 * que animar al montar dejaría la celebración jugada antes de que el usuario
 * la vea. Con la hoja cerrada las partículas quedan en frame estático — sin
 * trabajo por frame detrás de un modal invisible.
 */
function CelebrationMark({ visible }: { visible: boolean }) {
  const mode = useThemeTokens().mode
  const reduced = useReducedMotion()
  const well = useWellStyle('insetMd')
  const particles =
    mode === 'dark'
      ? neoParticlePresets.celebrationDark
      : neoParticlePresets.weekCloseLight

  const scale = useSharedValue(reduced ? 1 : 0.9)
  const opacity = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (!visible) return
    if (reduced) {
      scale.value = 1
      opacity.value = 1
      return
    }
    // Rearme en el mismo frame que la entrada: la hoja no se desmonta entre
    // resultados, así que sin volver al punto de partida la segunda
    // celebración entraría ya resuelta (el spring saldría de 1 hacia 1).
    // Rearmar al cerrar, en cambio, apagaría la escena a mitad del
    // slide-down de salida.
    scale.value = 0.9
    opacity.value = 0
    opacity.value = withTiming(1, { duration: motionDurations.quick })
    // @motion-allow: celebración (rara/primera vez) — spring con bounce sutil
    scale.value = withSpring(1, motionSprings.celebrate)
  }, [visible, reduced, scale, opacity])

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.celebrateWrap}>
      <Animated.View style={[styles.stage, well, animated]}>
        <View pointerEvents="none" style={styles.stageParticles}>
          <BrotParticles
            animated={visible && !reduced}
            borderRadius={neoRadii.hero}
            colors={particles.colors}
            count={particles.count}
          />
        </View>
        <BrotMascot animated={visible && !reduced} pose="cheer" shadow={false} size={92} />
      </Animated.View>
      {/* El confetti se monta CON la apertura: `ConfettiBurst` es inerte
          hasta recibir un token, y de-duplica por instancia — montarlo acá
          hace que el burst acompañe cada celebración (antes recibía el token
          vacío y no llegaba a dispararse nunca). */}
      {visible && !reduced ? (
        <ConfettiBurst colors={particles.colors} originY={55} pulseToken={1} />
      ) : null}
    </View>
  )
}

/** Ícono simple para error / restore / cambio programado (sin celebración). */
function SimpleMark({ variant }: { variant: PurchaseResultVariant }) {
  const ink = neoInk(useThemeTokens().mode)
  const well = useWellStyle('insetMd')
  const isErr = isError(variant)
  const icon = isErr
    ? 'error-outline'
    : variant === 'planChanged'
      ? 'event-available'
      : 'check'
  return (
    <View style={[styles.simpleCircle, well]}>
      <MaterialIcons
        color={isErr ? ink.warn : ink.accent}
        name={icon}
        size={26}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingVertical: 2 },
  footerCol: { gap: 10 },
  celebrateWrap: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stage: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderRadius: neoRadii.hero,
    overflow: 'hidden',
    paddingTop: 10,
  },
  stageParticles: StyleSheet.absoluteFillObject,
  simpleCircle: {
    width: 60,
    height: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
