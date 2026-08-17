import { useEffect } from 'react'
import {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// Glow lime (heroAccent) tenue ↔ brillante. Mode-invariante: pensado para
// superficies forest (heroGradient), idéntico en light y dark.
const GLOW_DIM = 'rgba(166,239,143,0.28)'
const GLOW_BRIGHT = 'rgba(166,239,143,0.95)'
// @motion-allow: respiración calma del glow (ciclo 3.2s total) — low-urgency.
const HALF_CYCLE_MS = 1600

/**
 * Border-glow: anima `borderColor` lime respirando (tenue ↔ brillante). Para
 * CTAs importantes sobre el gradiente forest del hero. Reemplaza el scale-pulse
 * (que con `overflow: hidden` recortaba los bordes en los laterales) — el glow
 * vive DENTRO del borde, nunca se corta. Aplicar el estilo devuelto a un
 * `Animated.View` con `borderWidth` + `borderRadius`.
 *
 * @param enabled cuando es false (p.ej. botón disabled) el glow se queda
 *        estático en un punto medio en vez de respirar.
 */
export function useBorderGlow(enabled = true) {
  const reduceMotion = useReducedMotion()
  const glow = useSharedValue(0)

  useEffect(() => {
    if (!enabled || reduceMotion) {
      cancelAnimation(glow)
      glow.value = withTiming(0.5, { duration: 200 })
      return
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: HALF_CYCLE_MS }),
        withTiming(0, { duration: HALF_CYCLE_MS }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(glow)
    }
  }, [enabled, reduceMotion, glow])

  return useAnimatedStyle(() => ({
    borderColor: interpolateColor(glow.value, [0, 1], [GLOW_DIM, GLOW_BRIGHT]),
  }))
}
