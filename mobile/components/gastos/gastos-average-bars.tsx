import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface GastosAverageBarsProps {
  values: number[] // 0..1, one per day
  color: string
  totalHeight?: number
  gap?: number
  minBarHeight?: number
  radius?: number
}

/**
 * Chunky bar chart used on the PROMEDIO DÍA card. Each bar claims an
 * equal slice of the available width (flex: 1) so the row spans the
 * full card; heights animate in from the bottom and empty days render
 * as a thin stub so they read as "dashes" between taller bars —
 * matching the Gastos V1 Cuaderno mock.
 */
export function GastosAverageBars({
  values,
  color,
  totalHeight = 20,
  gap = 4,
  minBarHeight = 3,
  radius = 3,
}: GastosAverageBarsProps) {
  return (
    <View style={[styles.row, { height: totalHeight, gap }]}>
      {values.map((v, i) => (
        <Bar
          key={i}
          value={v}
          color={color}
          height={totalHeight}
          minHeight={minBarHeight}
          radius={radius}
          delay={400 + i * 60}
        />
      ))}
    </View>
  )
}

function Bar({
  value,
  color,
  height,
  minHeight,
  radius,
  delay,
}: {
  value: number
  color: string
  height: number
  minHeight: number
  radius: number
  delay: number
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    )
  }, [delay, reduced, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
    transformOrigin: 'bottom' as const,
  }))
  const clamped = Math.max(0, Math.min(1, value))
  const h = Math.max(minHeight, Math.round(clamped * height))
  return (
    <Animated.View
      style={[
        {
          flex: 1,
          height: h,
          backgroundColor: color,
          borderRadius: radius,
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
})
