import { memo, useEffect } from 'react'
import { StyleSheet, type DimensionValue } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface CoralBloomProps {
  size?: number
  color?: string
  /** boxShadow glow string. */
  glow?: string
  left: DimensionValue
  top: DimensionValue
  durationMs?: number
}

const STOPS = [0, 0.25, 0.5, 0.75, 1]

/**
 * Flor coral que "late" pegada al helecho (keyframe bloomFlit del handoff):
 * deriva lenta ±3–5px + scale .98–1.05 + opacidad .7↔.95, ciclo 10.5–13.5s.
 * Un solo shared value 0→1; 0% y 100% son idénticos → loop sin salto.
 */
function CoralBloomImpl({
  size = 12,
  color = '#E2935E',
  glow,
  left,
  top,
  durationMs = 11500,
}: CoralBloomProps) {
  const reduced = useReducedMotion()
  const t = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      t.value = 0.5
      return
    }
    t.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    )
    return () => cancelAnimation(t)
  }, [reduced, t, durationMs])

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, STOPS, [0.7, 0.95, 0.85, 0.95, 0.7]),
    transform: [
      { translateX: interpolate(t.value, STOPS, [0, 4, -3, 3, 0]) },
      { translateY: interpolate(t.value, STOPS, [0, -5, -2, 4, 0]) },
      { scale: interpolate(t.value, STOPS, [1, 1.05, 0.98, 1.03, 1]) },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bloom,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left,
          top,
          boxShadow: glow ?? `0 0 ${size - 1}px 2px rgba(226,147,94,0.55)`,
        },
        animStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  bloom: {
    position: 'absolute',
  },
})

export const CoralBloom = memo(CoralBloomImpl)
