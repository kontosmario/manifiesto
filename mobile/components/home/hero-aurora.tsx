import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface HeroAuroraProps {
  radius?: number
}

export function HeroAurora({ radius = 28 }: HeroAuroraProps) {
  const reduced = useReducedMotion()
  const { theme } = useAppTheme()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)

  useEffect(() => {
    if (reduced) return
    const loop = (sv: typeof a, period: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    }
    loop(a, 4500)
    loop(b, 5500)
    loop(c, 6500)
  }, [reduced, a, b, c])

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -20 * a.value }, { translateY: 30 * a.value }, { scale: 1 + 0.15 * a.value }],
  }))
  const bStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 30 * b.value }, { translateY: -20 * b.value }, { scale: 1 + 0.2 * b.value }],
  }))
  const cStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -25 * c.value }, { translateY: -15 * c.value }, { scale: 1 + 0.3 * c.value }],
  }))

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }]}>
      <Animated.View style={[styles.blob, { top: -40, right: -40, width: 200, height: 200, backgroundColor: theme.colors.auroraA }, aStyle]} />
      <Animated.View style={[styles.blob, { bottom: -50, left: -30, width: 180, height: 180, backgroundColor: theme.colors.auroraB }, bStyle]} />
      <Animated.View style={[styles.blob, { top: 60, left: '40%', width: 140, height: 140, backgroundColor: theme.colors.auroraC }, cStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 9999, opacity: 0.9 },
})
