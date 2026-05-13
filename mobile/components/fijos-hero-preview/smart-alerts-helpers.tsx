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
import { motionEasings } from '@/lib/motion/tokens'

const ENTER = motionEasings.enterSmooth

export function RiseRow({
  delay,
  children,
}: {
  delay: number
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : 10)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    return () => {
      cancelAnimation(y)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, y, opacity])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

export function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 540, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: ENTER }))
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
        helperStyles.rule,
        { backgroundColor: color, transformOrigin: 'left' },
        animStyle,
      ]}
    />
  )
}

const helperStyles = StyleSheet.create({
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.55,
  },
})

export function getSignalIcon(
  kind: 'stress-week' | 'fijos-ratio' | 'streak' | 'cycle-creep',
): 'event-busy' | 'pie-chart' | 'whatshot' | 'trending-up' {
  switch (kind) {
    case 'stress-week':
      return 'event-busy'
    case 'fijos-ratio':
      return 'pie-chart'
    case 'streak':
      return 'whatshot'
    case 'cycle-creep':
      return 'trending-up'
  }
}

export function urgencyToken(urgency: 'alta' | 'media' | 'baja'): {
  intensity: 'urgent' | 'warning' | 'positive'
} {
  if (urgency === 'alta') return { intensity: 'urgent' }
  if (urgency === 'media') return { intensity: 'warning' }
  return { intensity: 'positive' }
}
