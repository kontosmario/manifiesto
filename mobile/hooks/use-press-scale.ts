import type { ViewStyle } from 'react-native'
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedStyle,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'

interface PressScaleOptions {
  pressedScale?: number
  /**
   * Externally-supplied reduced-motion flag. When a parent renders many
   * pressables (e.g. the 30+ calendar cells in the Gastos kit) it can read
   * `useReducedMotion()` ONCE and pass the value down so every child animates
   * off the SAME source of truth. When provided it takes precedence; when
   * omitted the hook falls back to its own `useReducedMotion()` read
   * (backward-compatible — existing call sites are unaffected).
   *
   * Nota de costo: el `useReducedMotion()` interno de abajo ya es una lectura
   * pura de contexto (la suscripción única de AccessibilityInfo vive en
   * `ReducedMotionProvider`, app-wide), así que pasar `reduceMotion` ya NO
   * ahorra listeners nativos — cada celda solo paga un `useContext`. El prop
   * queda como conveniencia: garantiza un valor consistente / una sola fuente
   * de verdad para toda la grilla (y es inofensivo mantenerlo).
   */
  reduceMotion?: boolean
}

/**
 * Press-to-scale animation on Reanimated — runs on the UI thread on
 * native and compiles to CSS on web, so it stays fluid everywhere
 * regardless of what the JS thread is doing. Consumers apply the
 * returned `animatedStyle` to a Reanimated `Animated.View` and wire
 * the `onPressIn` / `onPressOut` handlers on their Pressable.
 */
export function usePressScale(options: PressScaleOptions = {}) {
  const { pressedScale = 0.97, reduceMotion } = options
  const scale = useSharedValue(1)
  // Unconditional read (rules-of-hooks); the hoisted `reduceMotion` prop wins
  // when supplied, else this internal value is the fallback.
  const internalReducedMotion = useReducedMotion()
  const isReducedMotionEnabled = reduceMotion ?? internalReducedMotion

  const animateTo = (nextValue: number) => {
    if (isReducedMotionEnabled) {
      scale.value = 1
      return
    }
    scale.value = withSpring(nextValue, {
      damping: motionSprings.press.damping,
      stiffness: motionSprings.press.stiffness,
      mass: motionSprings.press.mass,
    })
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  })) as AnimatedStyle<ViewStyle>

  return {
    animatedStyle,
    onPressIn: () => {
      if (isReducedMotionEnabled) return
      animateTo(pressedScale)
    },
    onPressOut: () => {
      if (isReducedMotionEnabled) return
      animateTo(1)
    },
  }
}
