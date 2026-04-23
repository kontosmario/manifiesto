import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface ShineOverlayProps {
  width: number
  height: number
  tint?: string
  delayMs?: number
  periodMs?: number
  style?: ViewStyle
}

export function ShineOverlay({ width, height, tint = 'rgba(255,255,255,0.45)', delayMs = 1800, periodMs = 3200, style }: ShineOverlayProps) {
  const reduced = useReducedMotion()
  const x = useSharedValue(-width)
  useEffect(() => {
    if (reduced) return
    x.value = withDelay(delayMs, withRepeat(withTiming(width * 1.2, { duration: periodMs, easing: Easing.inOut(Easing.quad) }), -1, false))
  }, [width, delayMs, periodMs, reduced, x])
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <Animated.View style={[{ width: width * 0.4, height }, a]}>
        <LinearGradient
          colors={['transparent', tint, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  )
}
