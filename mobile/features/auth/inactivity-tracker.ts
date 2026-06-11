// Foreground inactivity tracker — soft-locks the app after N ms with no
// user interaction.
//
// Why separate from background-relock:
//   • Background-relock triggers on AppState change (foreground arrival
//     after background spell). See `background-relock.ts`.
//   • Inactivity triggers when the app is ACTIVE in foreground but the
//     user hasn't touched it for a while (phone left unlocked next to
//     them, distracted, etc.).
//
// Both end up calling resetAppLock() + router.replace('/') so
// AppEntryGate re-evaluates and shows the lock screen.
//
// Sprint R-2 (2026-06-10): pure decision lives here; the AppState +
// interval wiring lives in `inactivity-relock-watcher.tsx`. The global
// touch listener that feeds `recordInteraction()` lives in
// `interaction-tracker-provider.tsx`.

import { LOCK_THRESHOLDS } from './lock-thresholds'

/**
 * Foreground inactivity threshold (ms). Single source of truth lives
 * in `lock-thresholds.ts` (LOCK_THRESHOLDS.inactivity). Re-exported
 * here for ergonomics — the watcher only imports from this module.
 */
export const INACTIVITY_THRESHOLD_MS = LOCK_THRESHOLDS.inactivity

// Module-level interaction timestamp. Set by `recordInteraction()` from
// touch events. Read by the tracker tick.
let lastInteractionAt = Date.now()

/**
 * Record a user interaction. Resets the inactivity timer.
 * Called by:
 *   • Global touch listener (InteractionTrackerProvider's onTouchStart)
 *   • expo-router navigation events (path/segment change)
 *   • AppState transition to 'active' (foreground arrival counts as
 *     interaction; pairs with BackgroundRelockWatcher which handles
 *     the >5min case independently).
 */
export function recordInteraction(): void {
  lastInteractionAt = Date.now()
}

export function getLastInteractionAt(): number {
  return lastInteractionAt
}

/**
 * Test-only helper. Resets the module-level timestamp so each test
 * can set up its own baseline. Not exported via barrel; reach in
 * directly from tests that need it.
 */
export function __resetInactivityTrackerForTest(at: number = Date.now()): void {
  lastInteractionAt = at
}

export interface ShouldLockForInactivityInput {
  lastInteractionAt: number
  now: number
  thresholdMs: number
  isUnlocked: boolean
  appState: 'active' | 'inactive' | 'background' | 'unknown' | 'extension'
}

/**
 * Pure decision: should we lock based on inactivity?
 *
 * Returns true only when ALL of:
 *   • App is in foreground (`appState === 'active'`)
 *   • App is currently unlocked
 *   • Time since last interaction exceeds threshold
 *   • Time delta is NOT negative (clock manipulation defense —
 *     mirrors background-relock's M-L-2 behavior; see
 *     `background-relock.ts` for the original rationale).
 */
export function shouldLockForInactivity(input: ShouldLockForInactivityInput): boolean {
  if (input.appState !== 'active') return false
  if (!input.isUnlocked) return false
  const delta = input.now - input.lastInteractionAt
  if (delta < 0) return true
  return delta >= input.thresholdMs
}
