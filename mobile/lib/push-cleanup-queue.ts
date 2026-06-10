/**
 * Sprint I · I-3 — Pure helpers for the failed-push-token-cleanup queue.
 *
 * Lives in its own file so the cap + age-eviction logic can be unit
 * tested under vitest without dragging in the rest of
 * `push-notifications.ts` (which imports expo-device, expo-constants,
 * runtime-environment, supabase, etc. — none of which the test env can
 * resolve).
 *
 * The queue itself is owned by `push-notifications.ts`; this module
 * only exposes the bounded-eviction primitive.
 */

export interface PendingCleanupEntry {
  userId: string
  queuedAt: number
}

/**
 * Hard cap on the queue length. Anything beyond is dropped FIFO
 * (oldest first). 20 is comfortably above the realistic worst case
 * (a user that logs in/out a handful of times offline) yet small
 * enough that SecureStore never bloats.
 */
export const MAX_PENDING_CLEANUP_QUEUE = 20

/**
 * Drop entries older than 30 days. By then the user has almost
 * certainly logged in again from a different device and any leftover
 * token has been pruned server-side by expo-push 410 handling.
 */
export const MAX_PENDING_CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Apply age eviction first, then FIFO-cap to `MAX_PENDING_CLEANUP_QUEUE`.
 *
 * Pure — does not touch SecureStore or any side-effect. Caller passes
 * the current queue + `now`; gets back the queue that should be
 * persisted.
 */
export function pruneCleanupQueue(
  queue: PendingCleanupEntry[],
  now: number = Date.now(),
): PendingCleanupEntry[] {
  const ageCutoff = now - MAX_PENDING_CLEANUP_AGE_MS
  // Sprint M · M-L-1 (2026-06-14): treat negative-delta entries
  // (queuedAt > now, i.e. "queued in the future") as untrustworthy and
  // drop them too. This catches devices whose clock jumped backwards
  // between queueing and pruning — otherwise the entry survives
  // indefinitely as `queuedAt >= ageCutoff` stays true.
  const fresh = queue.filter((entry) => {
    const delta = now - entry.queuedAt
    return delta >= 0 && entry.queuedAt >= ageCutoff
  })
  if (fresh.length <= MAX_PENDING_CLEANUP_QUEUE) return fresh
  const sorted = [...fresh].sort((a, b) => a.queuedAt - b.queuedAt)
  return sorted.slice(sorted.length - MAX_PENDING_CLEANUP_QUEUE)
}
