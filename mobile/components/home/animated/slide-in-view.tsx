import { useEffect, useRef } from 'react'
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
  // Only animate the slide-in on FIRST mount. Without this, when a
  // sibling list prepended a new row, every existing row's `delay`
  // prop shifted (delay = base + index * step), the effect re-fired,
  // and the whole list re-animated — glitchy on every add. The
  // entrance is an intro; after it's played once for this instance,
  // any later delay/duration changes are ignored.
  const hasAnimatedRef = useRef(false)
  useEffect(() => {
    if (reduced) return
    if (hasAnimatedRef.current) return
    hasAnimatedRef.current = true
    x.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    // Match the translateX easing — without it the opacity interpolated
    // linearly while the position eased out, so the fade and the slide
    // drifted out of sync (content looked "milky" before it landed).
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }))
  }, [delay, duration, reduced, x, opacity])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: opacity.value }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}
