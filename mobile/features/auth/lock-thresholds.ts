// Single source of truth for app-lock timing decisions.
//
// Why centralized: previously the 60_000ms threshold was hardcoded in
// background-relock.ts. With multiple triggers (background, foreground
// inactivity, sensitive actions) we need one canonical config.
//
// Values chosen for v1.0 (Finance app — UX > strict security at this
// surface, balanced against banks' typical 5-10min for the same).

/**
 * App-lock thresholds in milliseconds.
 */
export const LOCK_THRESHOLDS = {
  /**
   * Background dwell after which foreground triggers re-lock.
   * Previous: 60_000 (60s) — too aggressive for normal use.
   * New: 5min — matches typical finance app behavior.
   */
  background: 5 * 60 * 1000,

  /**
   * Foreground inactivity (no user interaction) after which re-lock.
   * Currently UNUSED — will be activated by Sprint R-2 inactivity tracker.
   */
  inactivity: 15 * 60 * 1000,

  /**
   * Background dwell for re-lock when user is on a sensitive screen
   * (delete-account, password-change, payment confirm, etc).
   * Tighter than `background` because these screens benefit from
   * stricter timing.
   */
  sensitiveBackground: 30 * 1000,

  /**
   * Grace window after a successful unlock during which a quick
   * background dip (notification center peek, quick app switch) does
   * NOT trigger re-lock. Reduces friction.
   */
  unlockGrace: 30 * 1000,
} as const

export type LockTrigger = keyof typeof LOCK_THRESHOLDS
