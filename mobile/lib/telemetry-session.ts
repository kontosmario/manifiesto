// Pure helpers for screen-telemetry session lifecycle.
//
// Lives in mobile/lib (not in features/home or features/telemetry)
// because both layers need the same session-id semantics and
// either-direction import creates a feature cycle. Pure functions,
// unit-testable in isolation.

/** Generate a session id without depending on `crypto.randomUUID`,
 *  which isn't available everywhere in RN/Hermes. Math.random + time
 *  is enough for client-side correlation — we don't need cryptographic
 *  uniqueness for analytics IDs. */
export function newSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `${ts}-${rand}`
}

/** A re-open is "in the same session" if the gap since the last
 *  unmount is below this threshold (ms). Larger gaps reset the
 *  session (the user effectively went away). */
export const REOPEN_THRESHOLD_MS = 60_000

/**
 * Returns true when a fresh mount, given the previous unmount
 * timestamp and "now", should be classified as an in-session re-open.
 */
export function isReopenInSession(
  lastUnmountedAt: number | null,
  now: number,
): boolean {
  if (lastUnmountedAt == null) return false
  return now - lastUnmountedAt < REOPEN_THRESHOLD_MS
}
