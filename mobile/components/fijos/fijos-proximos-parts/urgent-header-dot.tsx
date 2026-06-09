import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'

/**
 * UrgentHeaderDot — punto de 7pt al lado del eyebrow "PRÓXIMOS A
 * PAGAR" que pulsa cuando hay items urgentes (≤2d). Anuncio sutil
 * pero notorio del estado del card sin agregar texto extra. Pulso
 * de scale 0.85 → 1.15 + opacity 0.65 → 1, 1.4s ease-in-out
 * (breath-like). ReduceMotion-aware.
 */
export function UrgentHeaderDot({ color }: { color: string }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    pulse.value = withRepeat(
      // @motion-allow: 700ms breath cycle — pulso ambient sutil para urgent header dot. Fuera del rango UI (max 480ms) y más rápido que decorativeDurations.pulse (1200) por diseño.
      withTiming(1, { duration: 700, easing: motionEasings.warm }),
      -1,
      true, // reverse = respiración
    )
    return () => cancelAnimation(pulse)
  }, [reduced, pulse])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + pulse.value * 0.3 }],
    opacity: 0.65 + pulse.value * 0.35,
  }))

  return (
    <Animated.View
      style={[styles.urgentHeaderDot, { backgroundColor: color }, style]}
    />
  )
}

const styles = StyleSheet.create({
  urgentHeaderDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
})
