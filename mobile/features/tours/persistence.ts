import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

/**
 * Device-local tours preferences. As of 2026-05-27 the per-tour
 * "seen" flags moved to the backend (`profiles.tours_seen`) so they
 * follow the user across devices and reinstalls. The only flag still
 * stored on-device is `tours-disabled`, a global toggle a user can
 * flip in Settings to suppress all auto-start tours on this device.
 *
 * Backend-side seen flags are read/written via:
 *   - `useToursSeen()` — read
 *   - `useMarkTourSeen()` — write one
 *   - `useResetTourSeen()` — reset one or all
 *
 * IMPORTANT: reset paths use `deletePersistentValue` rather than
 * writing an empty string. iOS Keychain rejects empty values
 * silently, so a `setItemAsync(key, '')` would leave the previous
 * `'1'` in place and the toggle would keep returning `false` forever.
 */
const DISABLED_KEY = 'tours-disabled'

/**
 * Reset device-local tour preferences. Currently only clears the
 * global `tours-disabled` toggle. The per-tour "seen" flags moved
 * to the backend in 2026-05-27 — those are reset via
 * `useResetTourSeen().resetAll()` (Settings → "Volver a ver todos").
 *
 * Kept as an export because `logoutSession` calls it to wipe the
 * device-local global toggle when switching users on the same device.
 */
export async function resetAllTours(): Promise<void> {
  await deletePersistentValue(DISABLED_KEY)
}

export async function getToursEnabled(): Promise<boolean> {
  const raw = await getPersistentValue(DISABLED_KEY)
  return raw !== '1'
}

export async function setToursEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await deletePersistentValue(DISABLED_KEY)
  } else {
    await setPersistentValue(DISABLED_KEY, '1')
  }
}
