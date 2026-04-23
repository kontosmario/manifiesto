import { useEffect, useMemo, useState } from 'react'
import { Animated, Easing } from 'react-native'

interface UseAuthLaunchSplashAnimationParams {
  onComplete?: () => void
  persistent?: boolean
  reducedMotion?: boolean
  width: number
}

export function useAuthLaunchSplashAnimation({
  onComplete,
  persistent = false,
  reducedMotion = false,
  width,
}: UseAuthLaunchSplashAnimationParams) {
  const [overlayOpacity] = useState(() => new Animated.Value(1))
  const [stageOpacity] = useState(() => new Animated.Value(1))
  const [badgeOpacity] = useState(() => new Animated.Value(1))
  const [badgeTranslateY] = useState(() => new Animated.Value(reducedMotion ? 0 : -2))
  const [walletOpacity] = useState(() => new Animated.Value(1))
  const [walletTranslateY] = useState(() => new Animated.Value(reducedMotion ? 0 : 12))
  const [walletScale] = useState(() => new Animated.Value(reducedMotion ? 1 : 0.96))
  const [walletFloat] = useState(() => new Animated.Value(0))
  const [glowScale] = useState(() => new Animated.Value(reducedMotion ? 1 : 0.97))
  const [titleOpacity] = useState(() => new Animated.Value(1))
  const [titleTranslateY] = useState(() => new Animated.Value(reducedMotion ? 0 : 4))
  const [subtitleOpacity] = useState(() => new Animated.Value(1))
  const [subtitleTranslateY] = useState(() => new Animated.Value(reducedMotion ? 0 : 6))
  const [shimmerTranslate] = useState(() => new Animated.Value(-1))

  const walletWidth = Math.min(width * 0.68, 290)
  const walletHeight = walletWidth * (369 / 677)
  const shimmerWidth = Math.min(width * 0.42, 180)
  const splashDuration = reducedMotion ? 2600 : 3600

  const walletLift = useMemo(
    () =>
      walletFloat.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -10],
      }),
    [walletFloat],
  )

  const shimmerOffset = useMemo(
    () =>
      shimmerTranslate.interpolate({
        inputRange: [-1, 1],
        outputRange: [-shimmerWidth * 0.7, shimmerWidth * 0.7],
      }),
    [shimmerTranslate, shimmerWidth],
  )

  useEffect(() => {
    const intro = Animated.parallel([
      Animated.timing(stageOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(badgeOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(badgeTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(walletOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(walletTranslateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(walletScale, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(glowScale, {
        toValue: reducedMotion ? 1 : 1.02,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titleTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(subtitleTranslateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ])

    const loops = reducedMotion
      ? []
      : [
          Animated.loop(
            Animated.sequence([
              Animated.timing(walletFloat, {
                toValue: 1,
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(walletFloat, {
                toValue: 0,
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
          ),
          Animated.loop(
            Animated.sequence([
              Animated.timing(glowScale, {
                toValue: 1.04,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(glowScale, {
                toValue: 0.92,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
          ),
          Animated.loop(
            Animated.timing(shimmerTranslate, {
              toValue: 1,
              duration: 1150,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
            { resetBeforeIteration: true },
          ),
        ]

    intro.start()
    loops.forEach((animation) => animation.start())

    const hideTimer = persistent
      ? null
      : setTimeout(() => {
          loops.forEach((animation) => animation.stop())

          Animated.parallel([
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 420,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(stageOpacity, {
              toValue: 0,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            if (finished) {
              onComplete?.()
            }
          })
        }, splashDuration)

    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
      }
      intro.stop()
      loops.forEach((animation) => animation.stop())
    }
  }, [
    badgeOpacity,
    badgeTranslateY,
    glowScale,
    onComplete,
    overlayOpacity,
    persistent,
    reducedMotion,
    shimmerTranslate,
    splashDuration,
    stageOpacity,
    subtitleOpacity,
    subtitleTranslateY,
    titleOpacity,
    titleTranslateY,
    walletFloat,
    walletOpacity,
    walletScale,
    walletTranslateY,
  ])

  return {
    badgeOpacity,
    badgeTranslateY,
    glowScale,
    overlayOpacity,
    shimmerOffset,
    shimmerWidth,
    stageOpacity,
    subtitleOpacity,
    subtitleTranslateY,
    titleOpacity,
    titleTranslateY,
    walletHeight,
    walletLift,
    walletOpacity,
    walletScale,
    walletTranslateY,
    walletWidth,
  }
}
