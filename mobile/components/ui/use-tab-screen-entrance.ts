import { useEffect, useRef } from 'react'
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated'
import type { ViewStyle } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion'

// Calmer than the standard 320ms content-entrance: a softer half-ish
// second fade for the once-per-tab first load. Tuned by feel.
const TAB_ENTRANCE_DURATION_MS = 420

interface TabScreenEntranceMotion {
  /** Reanimated worklet style → opacity only (no transform). */
  style: AnimatedStyle<ViewStyle>
}

/**
 * Calm, professional first-load entrance for the main tab screens.
 *
 * Why opacity-only (no translate):
 * --------------------------------
 * The tabs are pre-mounted (`lazy:false`) but detached while inactive,
 * so their content is already laid out at its FINAL position behind the
 * scenes. Any translate-based entrance (the old `useScreenEntrance`
 * translateY rise, the per-card RiseView rises, or `useTabFocusFade`'s
 * translateX) fires on the FIRST native attach and SNAPS the content
 * from its final position back to a start offset, then animates — the
 * "first-load jolt" the user reported. A pure opacity fade has nothing
 * to reposition: the content never moves, so it can never jolt.
 *
 * Mechanics:
 * ----------
 *   • The opacity shared value starts at 0 AT MOUNT (boot), so the
 *     worklet owns it from the very first frame — when the detached
 *     screen attaches on first focus it's already at 0 (invisible),
 *     never flashing at 1 first.
 *   • On the FIRST focus, it fades 0 → 1 with a calm ease. Subsequent
 *     tab switches are instant (already at 1) — the right call for
 *     frequent navigation.
 *   • Reduced motion: starts and stays at 1 (no fade).
 *
 * `enabled` is `false` for non-tab screens (they keep the standard
 * `useScreenEntrance` rise, which is fine for a fresh stack/modal mount
 * that isn't detached).
 */
export function useTabScreenEntrance(enabled: boolean): TabScreenEntranceMotion {
  const reducedMotion = useReducedMotion()
  const active = enabled && !reducedMotion
  const opacity = useSharedValue(active ? 0 : 1)
  const isFocused = useIsFocused()
  const hasEnteredRef = useRef(false)

  useEffect(() => {
    if (!active) {
      opacity.value = 1
      return
    }
    if (isFocused && !hasEnteredRef.current) {
      hasEnteredRef.current = true
      opacity.value = withTiming(1, {
        // First-load fade is a once-per-tab moment, so it can run a
        // touch longer than the standard 320ms for a calmer, softer
        // feel without reading as slow. Subsequent switches stay
        // instant (already at 1).
        duration: TAB_ENTRANCE_DURATION_MS,
        easing: motionEasings.standard,
      })
    }
  }, [active, isFocused, opacity])

  useEffect(() => {
    return () => {
      cancelAnimation(opacity)
    }
  }, [opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return { style }
}
