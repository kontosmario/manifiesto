import { useEffect, useRef, useState } from 'react'
import { Animated, Easing } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  getLastTabPressAt,
  subscribeTabPress,
} from '@/lib/tab-focus-pulse'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'

// How recently a tab press must have happened for a focus transition
// to count as "arriving via the tab bar". 500ms covers the tab switch
// animation + a bit of slack; stack pops happen outside this window.
const TAB_PRESS_WINDOW_MS = 500

/**
 * Returns an `Animated.Value` opacity (0.9..1) that plays a short
 * fade-in whenever the screen becomes focused because of a tab press.
 *
 * Stack pops (closing add-expense, etc.) do NOT trigger the fade —
 * the animation keys off a tab-press pulse that only fires when the
 * user taps a tab icon. Net effect: tab switches feel fresh with a
 * subtle reveal, while back-swiping out of a modal snaps cleanly to
 * the preserved screen underneath.
 */
export function useTabFocusFade() {
  const [opacity] = useState(() => new Animated.Value(1))
  const isFocused = useIsFocused()
  const lastTabPressRef = useRef(getLastTabPressAt())
  const reducedMotion = useReducedMotion()

  // Keep a local ref to the latest tab-press timestamp without causing
  // re-renders on every publish.
  useEffect(() => {
    return subscribeTabPress((ts) => {
      lastTabPressRef.current = ts
    })
  }, [])

  // Run the fade on every focus transition that coincides with a
  // recent tab press. We intentionally don't gate on a wasFocused ref:
  // React Navigation fires a single `isFocused=true` render when the
  // screen mounts to the active tab, which matches user expectation.
  const prevFocusedRef = useRef(isFocused)
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1)
      prevFocusedRef.current = isFocused
      return
    }

    const wasFocused = prevFocusedRef.current
    prevFocusedRef.current = isFocused

    if (!isFocused) return

    const sincePress = Date.now() - lastTabPressRef.current
    if (sincePress > TAB_PRESS_WINDOW_MS) {
      // Not a tab press. Could be initial mount or a stack pop —
      // leave opacity at 1 so nothing blinks.
      opacity.setValue(1)
      return
    }

    // Only animate when the focus transition is inbound (false → true).
    // Prevents duplicate animations if a dependency re-render keeps
    // isFocused true.
    if (wasFocused) return

    opacity.setValue(0.92)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start()
  }, [isFocused, opacity, reducedMotion])

  return opacity
}
