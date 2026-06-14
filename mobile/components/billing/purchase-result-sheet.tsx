import { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { ModalCard } from '@/components/ui/modal-card'
import { CardParticles } from '@/components/ui/card-particles'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { AppButton } from '@/components/ui/button'
import { FernMark } from '@/components/billing/fern-mark'
import { getStateTokens } from '@/theme/state-tokens'
import { motionSprings } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Resultado de compra/restore como sheet on-brand (reemplaza los Alert
 * nativos). `success` es el momento celebratorio: helecho crema en círculo
 * forest con glow + luciérnagas + confetti, escala 0.9→1 (NUNCA scale(0)).
 * Respeta reduced-motion. El gotcha de modal-chain (presentar tras cerrarse
 * la hoja de StoreKit) lo maneja el host con InteractionManager.
 */
export type PurchaseResultVariant =
  | 'success'
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

const COPY: Record<
  PurchaseResultVariant,
  { title: string; body: (planName?: string, reason?: string) => string }
> = {
  success: {
    title: '¡Bienvenido al hogar!',
    body: (planName) =>
      `Tu ${planName ?? 'plan'} ya está activo. Acceso completo para vos y tu hogar.`,
  },
  restored: {
    title: 'Recuperamos tu suscripción',
    body: () => 'Ya tenés acceso a tu plan en este dispositivo.',
  },
  error: {
    title: 'No pudimos confirmar tu compra',
    body: (_p, reason) =>
      reason ?? 'Reintentá en un momento. No se te cobró nada.',
  },
  restoreError: {
    title: 'No pudimos restaurar',
    body: (_p, reason) =>
      reason ?? 'Reintentá en un momento.',
  },
}

export const PurchaseResultSheet = memo(function PurchaseResultSheet({
  visible,
  variant,
  planName,
  reason,
  onClose,
  onRetry,
}: PurchaseResultSheetProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const copy = COPY[variant]
  const isCelebration = variant === 'success'
  const isPositive = variant === 'success' || variant === 'restored'

  const footer = isError(variant) ? (
    <View style={styles.footerCol}>
      {onRetry ? (
        <AppButton label="Reintentar" variant="primary" fullWidth onPress={onRetry} />
      ) : null}
      <AppButton label="Cerrar" variant="ghost" fullWidth onPress={onClose} />
    </View>
  ) : (
    <AppButton
      label={isCelebration ? 'Empezar' : 'Listo'}
      variant="primary"
      fullWidth
      onPress={onClose}
    />
  )

  return (
    <ModalCard
      visible={visible}
      title={copy.title}
      subtitle={copy.body(planName, reason)}
      onClose={onClose}
      footer={footer}
    >
      <View style={styles.body}>
        {isCelebration ? (
          <CelebrationMark reduced={reduced} heroGradient={theme.colors.heroGradient} />
        ) : (
          <SimpleMark positive={isPositive} theme={theme} />
        )}
      </View>
    </ModalCard>
  )
})

function isError(v: PurchaseResultVariant): boolean {
  return v === 'error' || v === 'restoreError'
}

/** Helecho crema en círculo forest con glow + luciérnagas + confetti. */
function CelebrationMark({
  reduced,
  heroGradient,
}: {
  reduced: boolean
  heroGradient: readonly string[]
}) {
  const scale = useSharedValue(reduced ? 1 : 0.9)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    opacity.value = withTiming(1, { duration: 180 })
    // @motion-allow: celebración (rara/primera vez) — spring con bounce sutil
    scale.value = withSpring(1, motionSprings.celebrate)
  }, [reduced, scale, opacity])

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.celebrateWrap}>
      {!reduced ? <ConfettiBurst /> : null}
      <Animated.View style={[styles.circle, animated]}>
        <LinearGradient
          colors={[...heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.circleFill}
        >
          <CardParticles count={5} color="#FFFBF2" accentColor="#A6EF8F" />
          <FernMark variant="cream" size={34} style={styles.fern} />
        </LinearGradient>
      </Animated.View>
    </View>
  )
}

/** Ícono simple para error/restore (sin celebración). */
function SimpleMark({
  positive,
  theme,
}: {
  positive: boolean
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const state = getStateTokens(positive ? 'positive' : 'caution', theme)
  return (
    <View style={[styles.simpleCircle, { backgroundColor: state.bg }]}>
      <MaterialIcons
        name={positive ? 'check' : 'error-outline'}
        size={26}
        color={state.fg}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingVertical: 6 },
  footerCol: { gap: 8 },
  celebrateWrap: { alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#A6EF8F',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  circleFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fern: { zIndex: 2 },
  simpleCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
