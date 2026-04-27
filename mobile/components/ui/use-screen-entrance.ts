import { useEffect, useState } from 'react'
import { Animated, Easing } from 'react-native'
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

interface UseScreenEntranceOptions {
  reducedMotion: boolean
}

// Plays the header + content rise animation ONCE when the Screen first
// mounts. Previously this fired on every focus (via useFocusEffect), so
// popping back from a pushed modal (add-expense, add-fixed-expense,
// etc.) made the underlying screen reset to opacity 0 and slide in
// again — visible as a "re-render" flash. Mounts still animate, but
// re-focuses of an already-mounted screen are now instant.
export function useScreenEntrance({ reducedMotion }: UseScreenEntranceOptions) {
  const [headerOpacity] = useState(() =>
    new Animated.Value(reducedMotion ? 1 : 0),
  )
  const [headerTranslateY] = useState(() =>
    new Animated.Value(reducedMotion ? 0 : 10),
  )
  const [contentOpacity] = useState(() =>
    new Animated.Value(reducedMotion ? 1 : 0),
  )
  const [contentTranslateY] = useState(() =>
    new Animated.Value(reducedMotion ? 0 : 18),
  )

  useEffect(() => {
    if (reducedMotion) {
      headerOpacity.setValue(1)
      headerTranslateY.setValue(0)
      contentOpacity.setValue(1)
      contentTranslateY.setValue(0)
      return
    }

    const headerAnimation = Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: motionDurations.standard,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(headerTranslateY, {
        toValue: 0,
        damping: motionSprings.enter.damping,
        stiffness: motionSprings.enter.stiffness,
        mass: motionSprings.enter.mass,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ])

    const contentAnimation = Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: motionDurations.standard,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        damping: motionSprings.enter.damping,
        stiffness: motionSprings.enter.stiffness,
        mass: motionSprings.enter.mass,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ])

    const animation = Animated.stagger(motionStagger.listItem, [
      headerAnimation,
      contentAnimation,
    ])
    animation.start()

    return () => {
      animation.stop()
    }
    // Intentionally mount-only: we don't want this to replay on focus,
    // theme changes, or reduced-motion toggles mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
