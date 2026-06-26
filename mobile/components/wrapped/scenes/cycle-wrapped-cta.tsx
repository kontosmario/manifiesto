import { useCallback, useEffect } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import type { ApplyDecisionInput } from '@/features/month-close/use-month-close-decision'
import { EXPO_OUT } from '../wrapped-constants'
import type { LeftoverOption } from './types'

// ── CTA con motion stack ─────────────────────────────────────────────
//
// Reemplaza el Pressable inline previo. Maneja:
// 1. Opacity transition cuando va de disabled → enabled (CTA emerge
//    al elegir una opción): 0.55 → 1.
// 2. Shadow bloom: 0 → 8px 22px -6px rgba(166,239,143,0.45).
// 3. Idle pulse cuando enabled: scale 1 → 1.012 → 1 cada 1.8s.
// 4. Press scale 0.97 via usePressScale combinado con el idle pulse.
// 5. Confetti dispatch al confirmar decisión REAL (no en flow vanilla
//    ni en past mode).
export function CycleWrappedCta({
  payload,
  leftoverSelected,
  applyingLeftover,
  setApplyingLeftover,
  onDismiss,
  fireConfetti,
  ctaBg,
  ctaFg,
  reduced,
}: {
  payload: CycleWrappedPayload
  leftoverSelected: LeftoverOption | null
  applyingLeftover: boolean
  setApplyingLeftover: (v: boolean) => void
  onDismiss: () => void
  fireConfetti: () => void
  ctaBg: string
  ctaFg: string
  reduced: boolean
}) {
  const hasPendingDecision = Boolean(
    payload?.pendingLeftoverDecision && payload?.onApplyLeftoverDecision,
  )
  const disabled =
    applyingLeftover || (hasPendingDecision && leftoverSelected === null)
  const label = hasPendingDecision
    ? leftoverSelected
      ? 'Confirmar y empezar'
      : 'Elige una opción'
    : 'Empezar el próximo'

  // Una sola progress shared value que dispara opacity + shadow al
  // pasar de disabled → enabled. Más simple que dos animaciones y se
  // mantienen syncronizadas.
  const enabledProgress = useSharedValue(disabled ? 0 : 1)
  useEffect(() => {
    enabledProgress.value = withTiming(disabled ? 0 : 1, {
      duration: motionDurations.enterStack,
      easing: EXPO_OUT,
    })
  }, [disabled, enabledProgress])

  // Idle pulse cuando el CTA está enabled. Same vibe que el cobro CTA
  // del home — scale sutil 1 → 1.012 → 1 con cycle 1.8s. Para
  // no chocar con press scale, lo aplicamos a un wrapper externo y
  // press en el inner.
  const idlePulse = useSharedValue(1)
  useEffect(() => {
    if (reduced || disabled) {
      cancelAnimation(idlePulse)
      idlePulse.value = 1
      return
    }
    idlePulse.value = withRepeat(
      withSequence(
        // @motion-allow: 900ms CTA idle pulse (cycle 1.8s) — matches el cobro CTA del home; calm "alive" breathing sin distraer del contenido del wrapped.
        withTiming(1.012, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        // @motion-allow: 900ms — paired with the up-phase above.
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(idlePulse)
    }
  }, [reduced, disabled, idlePulse])

  const press = usePressScale({ pressedScale: 0.97 })

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enabledProgress.value, [0, 1], [0.55, 1]),
    transform: [{ scale: idlePulse.value }],
    shadowColor: '#A6EF8F',
    shadowOpacity: 0.45 * enabledProgress.value,
    shadowRadius: 22 * enabledProgress.value,
    shadowOffset: { width: 0, height: 8 * enabledProgress.value },
  }))

  const handlePress = useCallback(async () => {
    if (disabled) return
    void triggerHaptic('selection')
    if (
      hasPendingDecision &&
      leftoverSelected &&
      payload?.onApplyLeftoverDecision &&
      payload?.pendingLeftoverDecision
    ) {
      setApplyingLeftover(true)
      try {
        let input: ApplyDecisionInput
        if (leftoverSelected === 'meta') {
          if (!payload.activeGoal) {
            // Sin meta: la opción NO debe ser seleccionable
            // (gating en la card). Defensa por si llega aquí.
            setApplyingLeftover(false)
            return
          }
          input = {
            monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
            decision: 'meta',
            metaGoalId: payload.activeGoal.id,
          }
        } else if (leftoverSelected === 'acumular') {
          input = {
            monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
            decision: 'acumular',
            newCycleAnchor:
              payload.nextCycleAnchor ??
              new Date().toISOString().slice(0, 10),
          }
        } else {
          input = {
            monthlySummaryId: payload.pendingLeftoverDecision.monthlySummaryId,
            decision: 'reserva',
          }
        }
        await payload.onApplyLeftoverDecision(input)
        // Confetti SOLO después del await exitoso. Si el RPC falla
        // (red, validation), el caller muestra Alert.alert con el
        // error y NO queremos que la celebración contradiga el mensaje.
        fireConfetti()
        setApplyingLeftover(false)
        onDismiss()
      } catch {
        setApplyingLeftover(false)
        // Errores de RPC los maneja el caller (mutation onError).
        // No disparamos confetti — el flow falló.
      }
      return
    }
    onDismiss()
  }, [
    disabled,
    hasPendingDecision,
    leftoverSelected,
    payload,
    fireConfetti,
    onDismiss,
    setApplyingLeftover,
  ])

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={press.animatedStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void handlePress()}
          onPressIn={disabled ? undefined : press.onPressIn}
          onPressOut={disabled ? undefined : press.onPressOut}
          style={[ctaStyles.cta, { backgroundColor: ctaBg }]}
        >
          <Text style={[ctaStyles.ctaText, { color: ctaFg }]}>{label}</Text>
          <MaterialIcons name="arrow-forward" size={18} color={ctaFg} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const ctaStyles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
})
