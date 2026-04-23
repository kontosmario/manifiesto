import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface RiseViewProps {
  delay?: number
  duration?: number
  translateY?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function RiseView({ delay = 0, duration = 700, translateY = 14, style, children }: RiseViewProps) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : translateY)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, reduced, y, opacity])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: opacity.value }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}
