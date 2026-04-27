import type { ViewStyle } from 'react-native'
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedStyle,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'

interface PressScaleOptions {
  pressedScale?: number
}

/**
 * Press-to-scale animation on Reanimated — runs on the UI thread on
 * native and compiles to CSS on web, so it stays fluid everywhere
 * regardless of what the JS thread is doing. Consumers apply the
 * returned `animatedStyle` to a Reanimated `Animated.View` and wire
 * the `onPressIn` / `onPressOut` handlers on their Pressable.
 */
export function usePressScale(options: PressScaleOptions = {}) {
  const { pressedScale = 0.97 } = options
  const scale = useSharedValue(1)
  const isReducedMotionEnabled = useReducedMotion()

  const animateTo = (nextValue: number) => {
    if (isReducedMotionEnabled) {
      scale.value = 1
      return
    }
    scale.value = withSpring(nextValue, {
      damping: motionSprings.press.damping,
      stiffness: motionSprings.press.stiffness,
      mass: motionSprings.press.mass,
    })
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  })) as AnimatedStyle<ViewStyle>

  return {
    animatedStyle,
    onPressIn: () => {
      if (isReducedMotionEnabled) return
      animateTo(pressedScale)
    },
    onPressOut: () => {
      if (isReducedMotionEnabled) return
      animateTo(1)
    },
  }
}
