import { useEffect, useState } from 'react'
import { Animated, Easing } from 'react-native'

export const ADD_BUTTON_GLOW_SIZE = 280

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

export function interpolateValue(
  value: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
) {
  if (inputRange.length !== outputRange.length || inputRange.length === 0) {
    return outputRange[0] ?? 0
  }

  if (value <= inputRange[0]) {
    return outputRange[0]
  }

  const lastIndex = inputRange.length - 1

  if (value >= inputRange[lastIndex]) {
    return outputRange[lastIndex]
  }

  for (let index = 1; index < inputRange.length; index += 1) {
    const inputStart = inputRange[index - 1]
    const inputEnd = inputRange[index]

    if (value <= inputEnd) {
      const outputStart = outputRange[index - 1]
      const outputEnd = outputRange[index]
      const progress = (value - inputStart) / (inputEnd - inputStart)

      return outputStart + (outputEnd - outputStart) * progress
    }
  }

  return outputRange[lastIndex]
}

export function useAddExpenseButtonGlow(isReducedMotionEnabled: boolean) {
  const [glowProgress] = useState(() => new Animated.Value(0))
  const [holdGlowProgress] = useState(() => new Animated.Value(0))
  const [glowIntensity, setGlowIntensity] = useState(0)

  const animateGlowTo = (value: number) => {
    if (isReducedMotionEnabled) {
      glowProgress.setValue(value)
      holdGlowProgress.setValue(value)
      return
    }

    if (value > 0) {
      holdGlowProgress.setValue(0)

      Animated.parallel([
        Animated.timing(glowProgress, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(holdGlowProgress, {
          toValue: 1,
          duration: 1350,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start()

      return
    }

    Animated.parallel([
      Animated.timing(glowProgress, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(holdGlowProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }

  useEffect(() => {
    let glowValue = 0
    let holdValue = 0

    const syncGlow = () => {
      setGlowIntensity(glowValue + holdValue * 0.75)
    }

    const glowListenerId = glowProgress.addListener(({ value }) => {
      glowValue = value
      syncGlow()
    })
    const holdGlowListenerId = holdGlowProgress.addListener(({ value }) => {
      holdValue = value
      syncGlow()
    })

    return () => {
      glowProgress.removeListener(glowListenerId)
      holdGlowProgress.removeListener(holdGlowListenerId)
    }
  }, [glowProgress, holdGlowProgress])

  const glowMeshScale = interpolateValue(glowIntensity, [0, 1, 1.75], [0.94, 1.05, 1.14])
  const buttonColorBoostOpacity = interpolateValue(glowIntensity, [0, 1, 1.75], [0, 0.18, 0.42])
  const buttonShineBoostOpacity = interpolateValue(glowIntensity, [0, 1, 1.75], [0, 0.12, 0.28])

  return {
    animateGlowTo,
    buttonColorBoostOpacity,
    buttonShineBoostOpacity,
    glowIntensity,
    glowMeshScale,
  }
}
