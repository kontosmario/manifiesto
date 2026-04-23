import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface FloatViewProps {
  amplitude?: number
  periodMs?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function FloatView({ amplitude = 6, periodMs = 3000, style, children }: FloatViewProps) {
  const reduced = useReducedMotion()
  const y = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    y.value = withRepeat(
      withSequence(
        withTiming(-amplitude, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
  }, [amplitude, periodMs, reduced, y])
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[style, a]}>{children}</Animated.View>
}
