import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface BreatheDotProps {
  size: number
  color: string
  glow?: string
  periodMs?: number
  style?: ViewStyle
}

export function BreatheDot({ size, color, glow, periodMs = 1800, style }: BreatheDotProps) {
  const reduced = useReducedMotion()
  const s = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    s.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [periodMs, reduced, s])
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: glow ?? color,
          shadowOpacity: glow ? 0.8 : 0,
          shadowRadius: size * 0.8,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
        a,
      ]}
    />
  )
}
