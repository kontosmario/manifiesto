import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface GastosStreakBarsProps {
  count: number
  maxBars?: number
  height?: number
  gradient?: readonly [string, string]
}

/**
 * 🔥-style stack of tiny bars that grow from the baseline. One bar per
 * day in the streak (capped at `maxBars`). Used on the Racha insight.
 */
export function GastosStreakBars({
  count,
  maxBars = 12,
  height = 18,
  gradient = ['#C7EE9C', '#6FE09A'] as const,
}: GastosStreakBarsProps) {
  const visible = Math.min(count, maxBars)
  if (visible <= 0) return null
  return (
    <View style={[styles.row, { height }]}>
      {Array.from({ length: visible }).map((_, i) => (
        <Bar key={i} gradient={gradient} height={height} delay={600 + i * 40} />
      ))}
    </View>
  )
}

function Bar({
  gradient,
  height,
  delay,
}: {
  gradient: readonly [string, string]
  height: number
  delay: number
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
    )
  }, [delay, reduced, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
    transformOrigin: 'bottom' as const,
  }))
  return (
    <Animated.View style={[styles.bar, { height }, style]}>
      <LinearGradient
        colors={[...gradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  bar: { flex: 1, borderRadius: 3, overflow: 'hidden' },
})
