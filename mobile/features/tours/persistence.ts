import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

/**
 * Per-tour "seen" flags. Stored in SecureStore so they survive
 * reinstall on iOS (Keychain) but reset on Android wipe — that's
 * fine: a user who reinstalled deserves to see the tour again.
 *
 * Keys are namespaced under `tour-seen.<tourKey>`. The value is the
 * literal string `'1'` when seen; absence means unseen. We never
 * store any user data, only a boolean-shaped flag.
 *
 * A separate `tours-disabled` flag exists for users who explicitly
 * turn tours off in Settings — when set, even unseen tours don't
 * auto-start.
 */
const SEEN_PREFIX = 'tour-seen.'
const DISABLED_KEY = 'tours-disabled'

function seenKey(tour: TourKey): string {
  return `${SEEN_PREFIX}${tour}`
}

export async function getTourSeen(tour: TourKey): Promise<boolean> {
  const raw = await getPersistentValue(seenKey(tour))
  return raw === '1'
}

export async function setTourSeen(tour: TourKey): Promise<void> {
  await setPersistentValue(seenKey(tour), '1')
}

export async function resetTourSeen(tour: TourKey): Promise<void> {
  // SecureStore has no `delete`, so write the empty string. The
  // `getTourSeen` check is `=== '1'`, so any other value is treated
  // as unseen and the tour will auto-start again on next entry.
  await setPersistentValue(seenKey(tour), '')
}

export async function resetAllTours(): Promise<void> {
  await Promise.all(ALL_TOUR_KEYS.map(resetTourSeen))
  // Re-enable in case the user had toggled them off globally.
  await setPersistentValue(DISABLED_KEY, '')
}

export async function getToursEnabled(): Promise<boolean> {
  const raw = await getPersistentValue(DISABLED_KEY)
  return raw !== '1'
}

export async function setToursEnabled(enabled: boolean): Promise<void> {
  await setPersistentValue(DISABLED_KEY, enabled ? '' : '1')
}
