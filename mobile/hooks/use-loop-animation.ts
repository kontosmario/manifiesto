import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import {
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Starts a set of infinite UI-thread loops when the screen becomes
 * focused and cancels them on blur or unmount. Keeps battery/GPU quiet
 * while the user is on a different tab or when reduced motion is on.
 *
 * Pass a `start` callback that kicks off your `withRepeat(...)` calls
 * (assigning to one or more shared values). The hook handles the
 * teardown: every shared value you pass in `sharedValues` gets
 * `cancelAnimation` on blur/unmount.
 */
export function useLoopAnimation(
  start: () => void,
  sharedValues: SharedValue<number>[],
  deps: ReadonlyArray<unknown> = [],
) {
  const isFocused = useIsFocused()
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced || !isFocused) {
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
  }, [reduced, isFocused, ...deps])
}
