import { useEffect } from 'react'
import {
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Variant of `useLoopAnimation` for components rendered OUTSIDE the
 * React Navigation tree (root-level overlays, splashes, etc.).
 *
 * Why this exists
 * ---------------
 * The standard `useLoopAnimation` hook gates `start()` on
 * `useIsFocused()` — perfect for tab screens (pauses loops when
 * off-tab to save battery), but **broken** for components mounted
 * outside any `<Screen>`. Outside the NavigationContainer,
 * `useIsFocused()` returns `false` on native (in @react-navigation v6+
 * it short-circuits when there's no NavigationContext), so the loops
 * never arrange.
 *
 * On web the asymmetry is silent — React Navigation's web fallback
 * defaults `useIsFocused` to `true` outside screens, so the same code
 * "just works" there. The bug only surfaces on iOS/Android.
 *
 * What this hook does instead
 * ---------------------------
 *   1. Runs `start()` on mount (always — no focus gating).
 *   2. Cancels every passed `SharedValue` on unmount + on
 *      reduced-motion toggle (parks loops at rest).
 *   3. Replays `start()` if `reduced` flips false → true mid-session.
 *   4. Honors `deps` for replaying when input config changes (e.g.
 *      duration, delay).
 *
 * When to use this vs `useLoopAnimation`
 * --------------------------------------
 * - Inside a `<Screen>` of the navigator → use `useLoopAnimation`
 *   (battery-friendly, pauses off-tab).
 * - Outside the navigator (root overlays, transition splashes,
 *   modal portals that bypass the navigator) → use
 *   `useUnboundedLoopAnimation` (this one).
 *
 * @example
 *   const t = useSharedValue(0)
 *   useUnboundedLoopAnimation(
 *     () => {
 *       t.value = withRepeat(
 *         withTiming(1, { duration: 2000 }),
 *         -1,
 *         true,
 *       )
 *     },
 *     [t],
 *   )
 */
export function useUnboundedLoopAnimation(
  start: () => void,
  sharedValues: SharedValue<number>[],
  deps: ReadonlyArray<unknown> = [],
) {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      for (const sv of sharedValues) {
        cancelAnimation(sv)
      }
      return
    }
    start()
    return () => {
      for (const sv of sharedValues) {
        cancelAnimation(sv)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sharedValues + start are stable by construction, deps controls the effect identity
  }, [reduced, ...deps])
}
