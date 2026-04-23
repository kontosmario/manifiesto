import { useState } from 'react'
import { Animated } from 'react-native'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

interface PressScaleOptions {
  pressedScale?: number
}

export function usePressScale(options: PressScaleOptions = {}) {
  const { pressedScale = 0.97 } = options
  const [scale] = useState(() => new Animated.Value(1))
  const isReducedMotionEnabled = useReducedMotion()

  const animateTo = (nextValue: number) => {
    if (isReducedMotionEnabled) {
      scale.setValue(1)
      return
    }

    Animated.spring(scale, {
      toValue: nextValue,
      useNativeDriver: USE_NATIVE_DRIVER,
      damping: motionSprings.press.damping,
      stiffness: motionSprings.press.stiffness,
      mass: motionSprings.press.mass,
    }).start()
  }

  return {
    animatedStyle: {
      transform: [{ scale: isReducedMotionEnabled ? 1 : scale }],
    },
    onPressIn: () => {
      if (isReducedMotionEnabled) {
        return
      }

      animateTo(pressedScale)
    },
    onPressOut: () => {
      if (isReducedMotionEnabled) {
        return
      }

      animateTo(1)
    },
  }
}
