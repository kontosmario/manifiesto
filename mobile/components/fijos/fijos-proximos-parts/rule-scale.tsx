import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'

const ENTER = motionEasings.enterSmooth

/**
 * Rule "scale" — barra de 22pt × 2pt que dibuja "left to right"
 * (scaleX 0 → 1) con fade-in, debajo del header del card.
 *
 * ReduceMotion-aware: render directo a opacity 1 / scaleX 1.
 */
export function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    // @motion-allow: 460ms — entrance scale on rule-scale glyph; deliberately longer than `slow` (480 visually too long for narrow band; 460 lands the "draw" feel without dragging). Designer-tuned.
    scale.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: motionDurations.enterStack, easing: ENTER }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, scale, opacity])
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scale.value }],
  }))
  return (
    <Animated.View
      style={[
        styles.rule,
        { backgroundColor: color, transformOrigin: 'left' },
        animStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  rule: {
    width: 22,
    height: 2,
    marginTop: 6,
    marginBottom: 6,
    opacity: 0.55,
  },
})
