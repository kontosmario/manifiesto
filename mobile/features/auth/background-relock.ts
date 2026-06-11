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
  /**
   * Sprint R-5 — Timestamp (ms) of the most recent successful unlock,
   * or null if never unlocked in this session. Combined with
   * `gracePeriodMs` below to skip re-lock for quick background dips
   * (notification center peek, app switch back) right after an unlock.
   * Pass `null` to disable the grace window entirely.
   */
  unlockedAt: number | null
  /**
   * Sprint R-5 — Grace window in ms after a successful unlock during
   * which a background dwell does NOT trigger re-lock. Reduces friction.
   * Pass `0` to disable.
   */
  gracePeriodMs: number
}

export function shouldRelock({
  leftActiveAt,
  now,
  thresholdMs,
  isUnlocked,
  unlockedAt,
  gracePeriodMs,
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
  if (delta < 0) return true
  if (delta < thresholdMs) return false

  // Sprint R-5 — Unlock grace window. If the user just unlocked
  // (e.g. opened the app, glanced at a notification, came back), we
  // skip the re-lock for `gracePeriodMs` after the unlock timestamp.
  // The grace window applies on top of the threshold check: even if
  // the threshold passed, we still skip if within grace.
  //
  // The clock-manipulation defense from the threshold check above
  // (delta < 0 → re-lock) covers the case where someone bumps clock
  // backwards. For the grace window, we apply the same defense: if
  // `now - unlockedAt` is negative (clock manipulation), don't honor
  // the grace — re-lock.
  if (unlockedAt !== null && gracePeriodMs > 0) {
    const sinceUnlock = now - unlockedAt
    if (sinceUnlock >= 0 && sinceUnlock < gracePeriodMs) {
      return false
    }
  }

  return true
}
