import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface MiniBarsProps {
  values: number[]   // 0..1 each
  color: string
  barWidth?: number
  totalHeight?: number
  delayBase?: number
}

export function MiniBars({ values, color, barWidth = 6, totalHeight = 30, delayBase = 400 }: MiniBarsProps) {
  return (
    <View style={[styles.row, { height: totalHeight }]}>
      {values.map((v, i) => (
        <Bar key={i} value={v} color={color} height={totalHeight} width={barWidth} delay={delayBase + i * 80} />
      ))}
    </View>
  )
}

function Bar({ value, color, height, width, delay }: { value: number; color: string; height: number; width: number; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }))
  }, [delay, reduced, scale])
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }))
  const h = Math.max(2, Math.min(1, value) * height)
  return (
    <Animated.View style={[{ width, height: h, backgroundColor: color, borderRadius: 2, transformOrigin: 'bottom' as const }, a]} />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
})
