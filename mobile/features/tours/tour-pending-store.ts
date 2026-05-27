import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

/**
 * Local fallback for tour-seen marks that couldn't reach the backend
 * (network failure during `useMarkTourSeen`). Re-tried by
 * `useMigrateToursToBackend` on every launch until the RPC succeeds.
 *
 * Keys: `tour-seen-pending.<tourKey>` in SecureStore. Value '1' when
 * pending. Mirrors the namespacing of the old `tour-seen.*` flags
 * that this module replaces as the only client-side tour storage.
 */
const PENDING_PREFIX = 'tour-seen-pending.'

function pendingKey(tour: TourKey): string {
  return `${PENDING_PREFIX}${tour}`
}

export async function setTourPending(tour: TourKey): Promise<void> {
  await setPersistentValue(pendingKey(tour), '1')
}

export async function clearTourPending(tour: TourKey): Promise<void> {
  await deletePersistentValue(pendingKey(tour))
}

export async function getPendingTours(): Promise<TourKey[]> {
  const result: TourKey[] = []
  for (const key of ALL_TOUR_KEYS) {
    const raw = await getPersistentValue(pendingKey(key))
    if (raw === '1') result.push(key)
  }
  return result
}

/**
 * Clear every pending-tour key. Called on logout so a user's failed-
 * sync flags don't leak into the next session: without this, user A
 * dismissing a tour offline → logout → user B logs in on the same
 * device → the migration drain would call `mark_tour_seen` under
 * user B's auth.uid(), marking user B as having seen a tour they
 * never saw.
 */
export async function clearAllTourPending(): Promise<void> {
  for (const key of ALL_TOUR_KEYS) {
    await deletePersistentValue(pendingKey(key))
  }
}
