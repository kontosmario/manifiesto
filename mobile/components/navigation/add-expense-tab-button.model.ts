import { useEffect, useState } from 'react'
import { Animated, Easing } from 'react-native'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

export const ADD_BUTTON_GLOW_SIZE = 280

// Ambient breathing loop — subtle pulse so the FAB feels alive even when idle.
export function useAddExpenseButtonBreath(isReducedMotionEnabled: boolean) {
  const [breath] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (isReducedMotionEnabled) {
      breath.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [breath, isReducedMotionEnabled])

  return {
    breathScale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }),
    breathHaloOpacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.48] }),
  }
}

// Burst ring — expands + fades on release to give a satisfying "ping".
export function useAddExpenseButtonBurst(isReducedMotionEnabled: boolean) {
  const [burst] = useState(() => new Animated.Value(0))

  const triggerBurst = () => {
    if (isReducedMotionEnabled) return
    burst.setValue(0)
    Animated.timing(burst, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start()
  }

  return {
    burstScale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }),
    burstOpacity: burst.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0, 0.5, 0],
    }),
    triggerBurst,
  }
}

// Rotation of the "+" glyph during press — snaps to 45° (x shape) then springs back.
export function useAddExpenseButtonIconRotation(isReducedMotionEnabled: boolean) {
  const [rotation] = useState(() => new Animated.Value(0))

  const animateRotationTo = (value: number) => {
    if (isReducedMotionEnabled) {
      rotation.setValue(value)
      return
    }
    Animated.spring(rotation, {
      toValue: value,
      useNativeDriver: USE_NATIVE_DRIVER,
      damping: 12,
      stiffness: 160,
      mass: 0.6,
    }).start()
  }

  return {
    iconRotate: rotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '45deg'],
    }),
    animateRotationTo,
  }
}

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
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(holdGlowProgress, {
          toValue: 1,
          duration: 1350,
          easing: Easing.linear,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start()

      return
    }

    Animated.parallel([
      Animated.timing(glowProgress, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(holdGlowProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
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
