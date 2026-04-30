import { useEffect, useRef } from 'react'
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing as REasing,
  type AnimatedStyle,
} from 'react-native-reanimated'
import type { ViewStyle } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSegments } from 'expo-router'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionSprings } from '@/lib/motion'
import {
  getLastTabPulse,
  subscribeTabPress,
  tabDirection,
  type TabPulse,
} from '@/lib/tab-focus-pulse'

// How recently a tab press must have happened for a focus transition
// to count as "arriving via the tab bar". 500ms covers the tab switch
// animation + a bit of slack; stack pops happen outside this window.
const TAB_PRESS_WINDOW_MS = 500

// Horizontal shift in px applied to the incoming tab content. Small
// enough that it reads as a "settle into place" rather than a full
// page slide — keeps the tab switch fast while signalling direction.
const TAB_SHIFT_PX = 16

// Faded-out opacity floor for the incoming content. The outgoing tab
// is unmounted by the navigator before we get focus, so this is the
// only opacity we control — pairs with the translate to feel like the
// destination is "arriving" rather than just appearing.
const TAB_INCOMING_OPACITY_FLOOR = 0.55

interface TabFocusMotion {
  /** Reanimated worklet style → opacity + translateX combined. */
  style: AnimatedStyle<ViewStyle>
}

/**
 * Returns a Reanimated worklet style for tab content. Plays a
 * directional reveal when the user navigates here via the tab bar
 * (incoming content slides in from the side opposite the previous
 * tab) and is a no-op for stack pops (closing add-expense, etc).
 *
 * Direction logic
 * ---------------
 * The pulse module records the route name the user is *leaving* and
 * the one they're *going to*. We compare those against `TAB_ORDER` to
 * decide whether the incoming tab should animate in from the right
 * (forward, +shift) or the left (backward, -shift).
 *
 * Stack pops bypass this entirely because the pulse only fires on a
 * `tabPress` event, never on a navigation pop.
 *
 * Migrated from RN core `Animated` to Reanimated v4 (UI-thread
 * worklets) for consistency with the rest of the codebase. The hook's
 * public surface is now a single `style` field — Screen.tsx applies
 * it directly to its outer Animated.View instead of composing two
 * legacy Animated.Values.
 */
export function useTabFocusFade(): TabFocusMotion {
  const opacity = useSharedValue(1)
  const translateX = useSharedValue(0)
  const isFocused = useIsFocused()
  const segmentsValue = useSegments()
  const lastPulseRef = useRef<TabPulse>(getLastTabPulse())
  const reducedMotion = useReducedMotion()

  // Each tab screen lives at `(app)/(tabs)/<name>`, so the last
  // segment is the tab's route name. We use it to decide direction
  // when this screen receives focus.
  const segments = segmentsValue as readonly string[]
  const ownRouteRef = useRef<string | null>(null)
  const tabIdx = segments.lastIndexOf('(tabs)')
  if (tabIdx >= 0 && segments.length > tabIdx + 1) {
    ownRouteRef.current = segments[tabIdx + 1] ?? null
  }

  // Keep a local ref to the latest pulse without triggering re-renders.
  useEffect(() => {
    return subscribeTabPress((pulse) => {
      lastPulseRef.current = pulse
    })
  }, [])

  const prevFocusedRef = useRef(isFocused)
  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1
      translateX.value = 0
      prevFocusedRef.current = isFocused
      return
    }

    const wasFocused = prevFocusedRef.current
    prevFocusedRef.current = isFocused

    if (!isFocused) return

    const pulse = lastPulseRef.current
    const sincePress = Date.now() - pulse.ts
    if (sincePress > TAB_PRESS_WINDOW_MS) {
      // Not a tab press — initial mount or stack pop. Snap to rest
      // so nothing blinks.
      opacity.value = 1
      translateX.value = 0
      return
    }

    // Only animate when the focus transition is inbound (false → true).
    if (wasFocused) return

    // Direction based on tab order; falls back to 0 (no shift) when
    // the route is unknown — opacity-only crossfade still applies.
    const direction = tabDirection(pulse.from, ownRouteRef.current)
    const startTx = direction * TAB_SHIFT_PX

    opacity.value = TAB_INCOMING_OPACITY_FLOOR
    translateX.value = startTx

    opacity.value = withTiming(1, {
      duration: motionDurations.enterTab,
      easing: REasing.out(REasing.quad),
    })
    translateX.value = withSpring(0, motionSprings.tabShift)
  }, [isFocused, opacity, translateX, reducedMotion])

  // Cleanup any in-flight tween/spring on unmount so the UI runtime
  // doesn't keep a driver alive after the screen is gone.
  useEffect(() => {
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(translateX)
    }
  }, [opacity, translateX])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }))

  return { style }
}
