// Pure helpers for the Home telemetry session lifecycle.
//
// Lives in its own module so unit tests can exercise the session-id
// generation and the re-open threshold without dragging in the
// supabase client (which `log-home-event.ts` imports). Pattern
// mirrors `signal-family.ts` (separated from `use-interaction-stats`).

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
 * Pure function so the same logic is testable in isolation.
 */
export function isReopenInSession(
  lastUnmountedAt: number | null,
  now: number,
): boolean {
  if (lastUnmountedAt == null) return false
  return now - lastUnmountedAt < REOPEN_THRESHOLD_MS
}
