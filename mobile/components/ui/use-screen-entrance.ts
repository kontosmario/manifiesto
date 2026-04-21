import { useCallback, useState } from 'react'
import { Animated, Easing } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

interface UseScreenEntranceOptions {
  reducedMotion: boolean
}

export function useScreenEntrance({ reducedMotion }: UseScreenEntranceOptions) {
  const [headerOpacity] = useState(() => new Animated.Value(0))
  const [headerTranslateY] = useState(() => new Animated.Value(10))
  const [contentOpacity] = useState(() => new Animated.Value(0))
  const [contentTranslateY] = useState(() => new Animated.Value(18))

  const reset = useCallback(() => {
    if (reducedMotion) {
      headerOpacity.setValue(1)
      headerTranslateY.setValue(0)
      contentOpacity.setValue(1)
      contentTranslateY.setValue(0)
      return
    }

    headerOpacity.setValue(0)
    headerTranslateY.setValue(10)
    contentOpacity.setValue(0)
    contentTranslateY.setValue(18)
  }, [
    contentOpacity,
    contentTranslateY,
    headerOpacity,
    headerTranslateY,
    reducedMotion,
  ])

  const runEntranceAnimation = useCallback(() => {
    reset()

    if (reducedMotion) {
      return () => {}
    }

    const headerAnimation = Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(headerTranslateY, {
        toValue: 0,
        damping: 20,
        stiffness: 210,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ])

    const contentAnimation = Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 190,
        mass: 1,
        useNativeDriver: true,
      }),
    ])

    const animation = Animated.stagger(45, [headerAnimation, contentAnimation])
    animation.start()

    return () => {
      animation.stop()
    }
  }, [
    contentOpacity,
    contentTranslateY,
    headerOpacity,
    headerTranslateY,
    reducedMotion,
    reset,
  ])

  useFocusEffect(
    useCallback(() => {
      const stopAnimation = runEntranceAnimation()

      return () => {
        stopAnimation()
        reset()
      }
    }, [reset, runEntranceAnimation]),
  )

  return {
    contentAnimatedStyle: {
      opacity: contentOpacity,
      transform: [{ translateY: contentTranslateY }],
    } as const,
    headerAnimatedStyle: {
      opacity: headerOpacity,
      transform: [{ translateY: headerTranslateY }],
    } as const,
  }
}
