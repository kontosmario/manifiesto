// Reduced-motion provider — owns the SINGLE source of the app-wide
// reduced-motion decision and hands it to every consumer via context.
//
// ─── Why this provider exists ───────────────────────────────────────
// The reduced-motion decision used to be computed inside
// `useReducedMotion()` itself. Because that hook is called from ~80
// components (and many of them fan out — e.g. every one of the 30+
// calendar cells in the Gastos kit goes through `usePressScale`), each
// call site registered its OWN `AccessibilityInfo.addEventListener(
// 'reduceMotionChanged')` and fired its OWN async
// `AccessibilityInfo.isReduceMotionEnabled()` on mount. On animation-
// heavy screens that meant dozens of native accessibility
// subscriptions + dozens of bridge round-trips per screen mount.
//
// This provider hoists that work to ONE place mounted near the app
// root: a single subscription + a single initial read. It resolves the
// final reduced-motion boolean and exposes it through context, so
// `useReducedMotion()` collapses into a pure `useContext` read — zero
// listeners and zero async calls per call site.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { AccessibilityInfo } from 'react-native'
import * as Device from 'expo-device'
import { useMotionPreference } from '@/features/preferences/motion-preference-provider'

// Device hardware classification — Expo's `deviceYearClass` returns
// the year of the device's benchmark class (computed against a Google
// curated DB of model/SoC perf). Hardware before 2020 generally can't
// sustain the per-frame cost of many concurrent `withRepeat` Reanimated
// loops on the UI thread.
//
// Verified empirically on a Samsung S9+ (year class 2018, Snapdragon
// 845): systrace showed 563 concurrent `animation` events filling
// every Choreographer frame at ~30ms each, hard-capping the app at
// 30fps. After flipping this to reduced motion, the steady-state
// frame rate jumped to ~60fps (50p frame time 28ms → 15ms, janky
// frames 88% → 47%).
//
// Why deviceYearClass instead of Platform.Version: API version is a
// proxy for hardware capability. It works in 95% of cases but has
// edge cases (a Pixel 5 on Android 11 entered "reduced" even though
// its A12 chipset is more than capable; a 2024 budget Android phone
// on Android 14 with weak hardware would NOT enter reduced even
// though it should). deviceYearClass measures the actual hardware,
// so the heuristic is more honest. On devices where Expo can't
// classify the hardware (null), we conservatively assume full motion
// — modern iOS always returns a year class; on null Android we keep
// full motion to avoid degrading on capable-but-unknown devices.
const HARDWARE_REQUIRES_REDUCED_MOTION =
  Device.deviceYearClass != null && Device.deviceYearClass < 2020

// Fallback for consumers mounted OUTSIDE the provider (isolated
// renders, tests). We default to the hardware-class decision so that,
// absent the live OS-accessibility signal, a call site still degrades
// on genuinely slow hardware — mirroring the pre-provider hook, whose
// OS value also started `false` before its async read resolved.
const ReducedMotionContext = createContext<boolean>(
  HARDWARE_REQUIRES_REDUCED_MOTION,
)

interface ReducedMotionProviderProps {
  children: ReactNode
}

/**
 * Resolves the app-wide reduced-motion decision and provides it via
 * context. Must be mounted INSIDE `MotionPreferenceProvider` (it reads
 * the user's motion preference).
 *
 * Resolution (identical to the pre-provider `useReducedMotion` logic),
 * in priority order:
 *   1. User's explicit preference from the Motion settings:
 *      - 'always' → forced reduced (override)
 *      - 'never'  → forced full motion (override)
 *      - 'auto'   → fall through to OS + hardware heuristic
 *   2. OS accessibility "Reduce Motion" toggle (any value true → reduced)
 *   3. Hardware device-year-class < 2020 → reduced
 *
 * The OS "Reduce Motion" toggle stays LIVE here: the single
 * `reduceMotionChanged` listener updates state, the resolved value
 * recomputes, and context propagates the change to every consumer —
 * so runtime toggling still cancels decorative loops in real time,
 * exactly as when each hook owned its own listener.
 */
export function ReducedMotionProvider({ children }: ReducedMotionProviderProps) {
  const motionPref = useMotionPreference()

  // Seed with `false` (full motion) to avoid a flash of reduced motion
  // before the async `isReduceMotionEnabled()` read resolves — matching
  // the pre-provider hook, which seeded its OS flag the same way.
  const [a11yReducedMotion, setA11yReducedMotion] = useState(false)

  useEffect(() => {
    let isMounted = true

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (isMounted) {
        setA11yReducedMotion(value)
      }
    })

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        setA11yReducedMotion(value)
      },
    )

    return () => {
      isMounted = false
      subscription.remove()
    }
  }, [])

  const resolved =
    motionPref === 'always'
      ? true
      : motionPref === 'never'
        ? false
        : // 'auto' (default): respect OS A11y + hardware class.
          a11yReducedMotion || HARDWARE_REQUIRES_REDUCED_MOTION

  return (
    <ReducedMotionContext.Provider value={resolved}>
      {children}
    </ReducedMotionContext.Provider>
  )
}

/** Internal accessor for `useReducedMotion()`. Prefer that hook. */
export function useReducedMotionValue(): boolean {
  return useContext(ReducedMotionContext)
}
