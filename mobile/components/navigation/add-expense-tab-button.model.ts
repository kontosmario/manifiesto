import { useEffect } from 'react'
import type { ViewStyle } from 'react-native'
import {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type AnimatedStyle,
  type DerivedValue,
} from 'react-native-reanimated'
import { decorativeDurations } from '@/lib/motion'

// Reanimated v4's `useAnimatedStyle` returns a `DefaultStyle` union
// (ViewStyle | TextStyle | ImageStyle) that TypeScript won't accept as
// a strict `AnimatedStyle<ViewStyle>` in style arrays. We cast to
// `AnimatedStyle<ViewStyle>` here so consumers can mix these styles
// with regular `ViewStyle`s without a type-level conflict — the
// runtime behavior is identical.
type ViewAnimatedStyle = AnimatedStyle<ViewStyle>

export const ADD_BUTTON_GLOW_SIZE = 280

/**
 * All FAB animations now run on Reanimated — animations execute on
 * the UI thread on native and compile to CSS/GPU on web, eliminating
 * the jitter that the old `Animated` API + JS-thread driver produced.
 *
 * Each hook returns an `AnimatedStyle` (not a raw shared value) so
 * consumers can drop it into a Reanimated `Animated.View`'s style
 * array without knowing about interpolation or derived values.
 */

// ─── 1. Ambient breathing loop ──────────────────────────────────────
// Subtle pulse so the FAB feels alive even when idle.
export function useAddExpenseButtonBreath(isReducedMotionEnabled: boolean) {
  const breath = useSharedValue(0)

  useEffect(() => {
    if (isReducedMotionEnabled) {
      breath.value = 0
      return
    }
    // 2800ms breath cycle (1400ms inhale + 1400ms exhale) = decorativeDurations.breath.
    const halfCycle = decorativeDurations.breath / 2
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(breath)
    }
  }, [breath, isReducedMotionEnabled])

  const breathHaloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, 1.035]) }],
    opacity: interpolate(breath.value, [0, 1], [0.28, 0.48]),
  })) as ViewAnimatedStyle

  return { breathHaloStyle }
}

// ─── 2. Burst ring (tap ripple) ─────────────────────────────────────
// Expands + fades on release to give a satisfying "ping".
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

// ─── 3. Icon rotation on press ──────────────────────────────────────
// "+" glyph snaps to 45° (x shape) then springs back when released.
export function useAddExpenseButtonIconRotation(isReducedMotionEnabled: boolean) {
  const rotation = useSharedValue(0)

  const animateRotationTo = (value: number) => {
    if (isReducedMotionEnabled) {
      rotation.value = value
      return
    }
    rotation.value = withSpring(value, {
      damping: 12,
      stiffness: 160,
      mass: 0.6,
    })
  }

  const iconRotateStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(rotation.value, [0, 1], [0, 45])}deg` },
    ],
  })) as ViewAnimatedStyle

  return { iconRotateStyle, animateRotationTo }
}

// ─── 4. Glow / hot-spot orchestration ───────────────────────────────
// Drives three visual layers at once:
//   - `glowMeshStyle`    → scale transform on the ambient glow mesh
//   - `colorBoostStyle`  → opacity of the green color boost inside the FAB face
//   - `shineBoostStyle`  → opacity of the white shine highlight
//
// Plus `intensityShared` so child components can read the intensity
// as a Reanimated shared value and build their own animated styles
// (e.g., the halos inside `AddExpenseGlowMesh`).
export interface AddExpenseButtonGlow {
  animateGlowTo: (value: number) => void
  glowMeshStyle: ViewAnimatedStyle
  colorBoostStyle: ViewAnimatedStyle
  shineBoostStyle: ViewAnimatedStyle
  intensityShared: DerivedValue<number>
}

export function useAddExpenseButtonGlow(
  isReducedMotionEnabled: boolean,
): AddExpenseButtonGlow {
  const glowProgress = useSharedValue(0)
  const holdGlowProgress = useSharedValue(0)

  const intensityShared = useDerivedValue(
    () => glowProgress.value + holdGlowProgress.value * 0.75,
  )

  const animateGlowTo = (value: number) => {
    if (isReducedMotionEnabled) {
      glowProgress.value = value
      holdGlowProgress.value = value
      return
    }
    if (value > 0) {
      holdGlowProgress.value = 0
      glowProgress.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      })
      holdGlowProgress.value = withTiming(1, {
        duration: 1350,
        easing: Easing.linear,
      })
      return
    }
    glowProgress.value = withTiming(0, {
      duration: 260,
      easing: Easing.out(Easing.quad),
    })
    holdGlowProgress.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    })
  }

  const glowMeshStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          intensityShared.value,
          [0, 1, 1.75],
          [0.94, 1.05, 1.14],
        ),
      },
    ],
  })) as ViewAnimatedStyle

  const colorBoostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intensityShared.value, [0, 1, 1.75], [0, 0.18, 0.42]),
  })) as ViewAnimatedStyle

  const shineBoostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intensityShared.value, [0, 1, 1.75], [0, 0.12, 0.28]),
  })) as ViewAnimatedStyle

  return {
    animateGlowTo,
    glowMeshStyle,
    colorBoostStyle,
    shineBoostStyle,
    intensityShared,
  }
}

// ─── Utility (still used by a couple of places) ─────────────────────
export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

// Re-export for external callers that import SharedValue<number> types.
export type { SharedValue } from 'react-native-reanimated'
