import { useEffect } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface SlideInViewProps {
  delay?: number
  duration?: number
  translateX?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function SlideInView({ delay = 0, duration = 600, translateX = -10, style, children }: SlideInViewProps) {
  const reduced = useReducedMotion()
  const x = useSharedValue(reduced ? 0 : translateX)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    x.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, reduced, x, opacity])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: opacity.value }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}
