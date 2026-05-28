import { useEffect } from 'react'
import {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'

interface UseScreenEntranceOptions {
  reducedMotion: boolean
  /**
   * Skip the entrance entirely (render settled, no rise). Used for tab
   * screens: they're pre-mounted + detached, so this mount-only rise
   * fires on the FIRST native attach (first visit) and moves the
   * already-laid-out content from translateY 18 up to 0 — the
   * "first-load content jump" the user sees. Tabs get their entrance
   * from the opacity-only `useTabScreenEntrance` instead, so stacking
   * this translate rise on top is both redundant and janky.
   */
  skip?: boolean
}

// Plays the header + content rise animation ONCE when the Screen first
// mounts. Previously this fired on every focus (via useFocusEffect), so
// popping back from a pushed modal (add-expense, add-fixed-expense,
// etc.) made the underlying screen reset to opacity 0 and slide in
// again — visible as a "re-render" flash. Mounts still animate, but
// re-focuses of an already-mounted screen are now instant.
//
// Migrated to Reanimated v4 (was using legacy `Animated` API). Keeps
// the same staggered "header rises first, then content" choreography
// using shared values + worklet-based styles. The timing/spring values
// come from `motion/tokens` so the rest of the app stays in lockstep.
export function useScreenEntrance({ reducedMotion, skip = false }: UseScreenEntranceOptions) {
  // `settled`: start (and stay) at the final state — no rise. Covers
  // reduced-motion AND tab screens (see `skip` doc above).
  const settled = reducedMotion || skip
  const headerOpacity = useSharedValue(settled ? 1 : 0)
  const headerTranslateY = useSharedValue(settled ? 0 : 10)
  const contentOpacity = useSharedValue(settled ? 1 : 0)
  const contentTranslateY = useSharedValue(settled ? 0 : 18)

  useEffect(() => {
    if (settled) {
      headerOpacity.value = 1
      headerTranslateY.value = 0
      contentOpacity.value = 1
      contentTranslateY.value = 0
      return
    }

    // Header rises first; content follows after `motionStagger.listItem`
    // so the header reads as "leading" and the body as "settling in".
    headerOpacity.value = withTiming(1, {
      duration: motionDurations.standard,
      easing: Easing.out(Easing.cubic),
    })
    headerTranslateY.value = withSpring(0, motionSprings.enter)

    contentOpacity.value = withDelay(
      motionStagger.listItem,
      withTiming(1, {
        duration: motionDurations.standard,
        easing: Easing.out(Easing.cubic),
      }),
    )
    contentTranslateY.value = withDelay(
      motionStagger.listItem,
      withSpring(0, motionSprings.enter),
    )

    return () => {
      // Cancel any in-flight animations if the screen unmounts mid-rise
      // (rare — usually mount runs to completion — but prevents leaked
      // worklet drivers when navigating away during the stagger window).
      cancelAnimation(headerOpacity)
      cancelAnimation(headerTranslateY)
      cancelAnimation(contentOpacity)
      cancelAnimation(contentTranslateY)
    }
    // Intentionally mount-only: we don't want this to replay on focus,
    // theme changes, or reduced-motion toggles mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Worklet styles — read SharedValue.value inside the worklet so the
  // UI runtime drives the per-frame updates without crossing to JS.
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }))

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }))

  return { contentAnimatedStyle, headerAnimatedStyle }
}
