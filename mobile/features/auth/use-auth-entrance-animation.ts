import { Animated, Easing } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthMode } from '@/features/auth/auth-flow'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

export function useAuthEntranceAnimation({
  isReducedMotionEnabled,
  mode,
}: {
  isReducedMotionEnabled: boolean
  mode: AuthMode
}) {
  const [heroOpacity] = useState(() => new Animated.Value(0))
  const [heroTranslateY] = useState(() => new Animated.Value(24))
  const [heroScale] = useState(() => new Animated.Value(0.96))
  const [panelOpacity] = useState(() => new Animated.Value(0))
  const [panelTranslateY] = useState(() => new Animated.Value(28))
  const [modeContentOpacity] = useState(() => new Animated.Value(1))
  const [modeContentTranslateY] = useState(() => new Animated.Value(0))
  const entranceAnimationRef = useRef<Animated.CompositeAnimation | null>(null)
  const modeTransitionAnimationRef = useRef<Animated.CompositeAnimation | null>(null)
  const hasSeenModeTransitionRef = useRef(false)

  useEffect(() => {
    modeTransitionAnimationRef.current?.stop()

    if (!hasSeenModeTransitionRef.current) {
      hasSeenModeTransitionRef.current = true
      modeContentOpacity.setValue(1)
      modeContentTranslateY.setValue(0)
      return
    }

    if (isReducedMotionEnabled) {
      modeContentOpacity.setValue(1)
      modeContentTranslateY.setValue(0)
      return
    }

    modeContentOpacity.setValue(0.72)
    modeContentTranslateY.setValue(10)

    const animation = Animated.parallel([
      Animated.timing(modeContentOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(modeContentTranslateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.exp),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ])

    modeTransitionAnimationRef.current = animation
    animation.start(({ finished }) => {
      if (finished) {
        modeTransitionAnimationRef.current = null
      }
    })

    return () => {
      animation.stop()
    }
  }, [isReducedMotionEnabled, mode, modeContentOpacity, modeContentTranslateY])

  const stopAnimations = useCallback(() => {
    entranceAnimationRef.current?.stop()
    modeTransitionAnimationRef.current?.stop()
  }, [])

  const resetAnimations = useCallback(() => {
    heroOpacity.setValue(0)
    heroTranslateY.setValue(24)
    heroScale.setValue(0.96)
    panelOpacity.setValue(0)
    panelTranslateY.setValue(28)
  }, [heroOpacity, heroScale, heroTranslateY, panelOpacity, panelTranslateY])

  const playEntrance = useCallback(() => {
    stopAnimations()

    if (isReducedMotionEnabled) {
      heroOpacity.setValue(1)
      heroTranslateY.setValue(0)
      heroScale.setValue(1)
      panelOpacity.setValue(1)
      panelTranslateY.setValue(0)
      return
    }

    resetAnimations()

    entranceAnimationRef.current = Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(heroScale, {
        toValue: 1,
        duration: 580,
        easing: Easing.out(Easing.exp),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(panelOpacity, {
        toValue: 1,
        duration: 460,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(panelTranslateY, {
        toValue: 0,
        duration: 520,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ])

    entranceAnimationRef.current.start()
  }, [
    heroOpacity,
    heroScale,
    heroTranslateY,
    isReducedMotionEnabled,
    panelOpacity,
    panelTranslateY,
    resetAnimations,
    stopAnimations,
  ])

  return {
    animation: {
      heroOpacity,
      heroScale,
      heroTranslateY,
      modeContentOpacity,
      modeContentTranslateY,
      panelOpacity,
      panelTranslateY,
    },
    playEntrance,
    stopAnimations,
  }
}
