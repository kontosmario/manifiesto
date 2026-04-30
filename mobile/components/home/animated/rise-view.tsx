import { useMemo } from 'react'
import { type ViewStyle } from 'react-native'
import Animated, { Keyframe, ReduceMotion } from 'react-native-reanimated'

interface RiseViewProps {
  delay?: number
  duration?: number
  translateY?: number
  style?: ViewStyle
  children: React.ReactNode
}

/**
 * Staggered fade-in + rise primitive used across the app for content
 * entrances (logo splash, dashboard cards, list sections, etc.).
 *
 * Why a Keyframe entering animation, not useSharedValue + useEffect
 * -----------------------------------------------------------------
 * The previous implementation ran a manual `withTiming` inside a
 * `useEffect` after applying initial values via `useSharedValue`.
 * That pattern works correctly on web (CSS animations resolve the
 * initial style on first paint) but caused a one-frame flash on
 * native: the View paints with its default style first (no transform,
 * opacity 1 → visible at final position), THEN Reanimated mounts the
 * worklet style and snaps to the start state, THEN the effect fires
 * withTiming and animates back. User-visible result: a "placeholder"
 * of the final state appears for ~16ms before the entrance plays.
 *
 * Reanimated layout animations (`entering={...}`) are applied by the
 * native layout coordinator BEFORE the first paint, so the start
 * state is honored synchronously — no flash. Keyframe lets us
 * combine opacity + translateY in one declarative animation, with
 * `translateY` as a runtime prop (so different RiseViews can rise
 * from different distances).
 */
export function RiseView({
  delay = 0,
  duration = 700,
  translateY = 14,
  style,
  children,
}: RiseViewProps) {
  const entering = useMemo(
    () =>
      new Keyframe({
        0: { opacity: 0, transform: [{ translateY }] },
        100: { opacity: 1, transform: [{ translateY: 0 }] },
      })
        .duration(duration)
        .delay(delay)
        // ReduceMotion.System: when the OS setting is on, the entrance
        // is skipped and the View renders at its final state directly.
        .reduceMotion(ReduceMotion.System),
    [duration, delay, translateY],
  )

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  )
}
