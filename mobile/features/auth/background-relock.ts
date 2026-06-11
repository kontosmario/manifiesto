// Pure decision for the per-launch app-lock re-arm on foreground.
//
// The app-lock (app-lock-state.ts) only re-locks on cold start. This
// adds a background-timeout re-lock: if the app was backgrounded longer
// than the threshold, re-arm the lock so AppEntryGate re-prompts Face ID
// on the next foreground. Pure + testable; the AppState wiring lives in
// background-relock-watcher.tsx.
//
// Sprint R-1 (2026-06-10): the canonical threshold value lives in
// `lock-thresholds.ts` (LOCK_THRESHOLDS.background). The named export
// here is kept for back-compat with the existing watcher + tests.

import { LOCK_THRESHOLDS } from './lock-thresholds'

/**
 * Background dwell time after which a foregrounding app re-locks.
 *
 * @deprecated — kept exported for back-compat with existing tests and
 * the BackgroundRelockWatcher. Use `LOCK_THRESHOLDS.background`
 * directly in new code.
 */
export const BACKGROUND_RELOCK_THRESHOLD_MS = LOCK_THRESHOLDS.background

export interface ShouldRelockInput {
  /** Timestamp (ms) the app last left the 'active' state, or null if it never did. */
  leftActiveAt: number | null
  /** Current time (ms). */
  now: number
  /** Re-lock threshold in ms. */
  thresholdMs: number
  /** Whether the app is currently unlocked (isAppUnlocked()). */
  isUnlocked: boolean
}

export function shouldRelock({
  leftActiveAt,
  now,
  thresholdMs,
  isUnlocked,
}: ShouldRelockInput): boolean {
  if (!isUnlocked) return false
  if (leftActiveAt === null) return false
  // Sprint M · M-L-2 (2026-06-14): treat negative-delta (clock moved
  // backwards between leaving 'active' and foregrounding) as
  // "manipulated → force re-lock". Otherwise an attacker who bumps the
  // clock backwards during background could indefinitely defer the
  // re-lock; the security-conservative move is to re-arm whenever the
  // timing math stops making sense.
  const delta = now - leftActiveAt
  return delta < 0 || delta >= thresholdMs
}
