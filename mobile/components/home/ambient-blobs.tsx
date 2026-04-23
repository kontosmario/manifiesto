import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

export function AmbientBlobs() {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    const loop = (sv: typeof a, period: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    }
    loop(a, 9000)
    loop(b, 11000)
    loop(c, 13000)
  }, [reduced, a, b, c])
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: a.value }] }))
  const bStyle = useAnimatedStyle(() => ({ transform: [{ translateY: b.value }] }))
  const cStyle = useAnimatedStyle(() => ({ transform: [{ translateY: c.value }] }))

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Animated.View style={[styles.blob, { top: -70, right: -50, width: 240, height: 240, backgroundColor: theme.colors.auroraA, opacity: 0.55 }, aStyle]} />
      <Animated.View style={[styles.blob, { top: 440, left: -80, width: 240, height: 240, backgroundColor: theme.colors.auroraB, opacity: 0.32 }, bStyle]} />
      <Animated.View style={[styles.blob, { top: 1000, right: -60, width: 260, height: 260, backgroundColor: theme.colors.auroraC, opacity: 0.35 }, cStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 9999 },
})
