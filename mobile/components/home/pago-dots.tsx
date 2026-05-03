import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface PagoDotsProps {
  paid: number
  total: number
}

const DOT_SIZE = 7
const DOT_GAP = 4

export function PagoDots({ paid, total }: PagoDotsProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row}>
      {Array.from({ length: Math.max(0, total) }).map((_, i) => (
        <Dot
          key={i}
          filled={i < paid}
          color={theme.colors.success}
          emptyColor={theme.colors.line}
          delay={400 + i * 40}
        />
      ))}
    </View>
  )
}

function Dot({
  filled,
  color,
  emptyColor,
  delay,
}: {
  filled: boolean
  color: string
  emptyColor: string
  delay: number
}) {
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    // @motion-allow: 400ms staggered dot fade-in; sits between deliberate (320) and slow (480) for readable progression
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }))
  }, [delay, reduced, opacity])
  const a = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      style={[
        {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: filled ? color : emptyColor,
        },
        a,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: DOT_GAP, alignItems: 'center' },
})
