import type { ViewStyle } from 'react-native'
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated'

// Reanimated v4's `useAnimatedStyle` returns a `DefaultStyle` union
// that TypeScript won't accept as a strict `AnimatedStyle<ViewStyle>`
// in style arrays. We cast so consumers can mix these styles with
// regular `ViewStyle`s without a type-level conflict — runtime
// behavior is identical.
type ViewAnimatedStyle = AnimatedStyle<ViewStyle>

/**
 * Single press-feedback animation for the FAB.
 *
 * Earlier versions also exposed an idle breathing loop, a multi-layer
 * glow with color/shine boosts, and a rotating icon. The 2026-05-04
 * audit removed those decorative loops (UX `excessive-motion` /
 * `continuous-animation` rules) — the FAB now communicates its
 * elevated status through shadow + cutout border, and reserves motion
 * for the user-initiated tap only.
 */

// Burst ring — expands and fades on release for a satisfying "ping".
export function useAddExpenseButtonBurst(isReducedMotionEnabled: boolean) {
  const burst = useSharedValue(0)

  const triggerBurst = () => {
    if (isReducedMotionEnabled) return
    burst.value = 0
    burst.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
  }

  const burstRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(burst.value, [0, 1], [0.6, 1.8]) }],
    opacity: interpolate(burst.value, [0, 0.15, 1], [0, 0.5, 0]),
  })) as ViewAnimatedStyle

  return { burstRingStyle, triggerBurst }
}

// Re-export for external callers that import SharedValue<number> types.
export type { SharedValue } from 'react-native-reanimated'
