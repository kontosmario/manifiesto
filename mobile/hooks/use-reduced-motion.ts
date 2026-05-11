import { useEffect, useState } from 'react'
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

/**
 * Final decision: should we suppress decorative loop animations?
 *
 * Resolved by combining (in priority order):
 *   1. User's explicit preference from the Motion settings:
 *      - 'always' → forced reduced (override)
 *      - 'never'  → forced full motion (override)
 *      - 'auto'   → fall through to OS + hardware heuristic
 *   2. OS accessibility "Reduce Motion" toggle (any value true → reduced)
 *   3. Hardware device-year-class < 2020 → reduced
 *
 * All `useLoopAnimation` / `useUnboundedLoopAnimation` consumers gate
 * their `withRepeat(...)` calls on this hook, so flipping it from true
 * to false in real time (user changes the setting) cancels every
 * decorative loop and parks the shared values at rest.
 */
export function useReducedMotion() {
  const motionPref = useMotionPreference()

  // Seed with hardware-class flag synchronously: avoids a flash of
  // "full motion" before the AccessibilityInfo promise resolves.
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

  if (motionPref === 'always') return true
  if (motionPref === 'never') return false
  // 'auto' (default): respect OS A11y + hardware class.
  return a11yReducedMotion || HARDWARE_REQUIRES_REDUCED_MOTION
}
