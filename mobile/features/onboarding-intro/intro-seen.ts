import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

/**
 * Device-local flag: did the user already see the PRE-AUTH onboarding
 * intro (the 5-slide showcase shown BEFORE creating an account)?
 *
 * Stored on-device (SecureStore THIS_DEVICE_ONLY / localStorage on web)
 * because there is NO user/profile yet at this point in the flow — the
 * intro runs before signup, so a backend column (like the in-app tours)
 * isn't available. Mirrors the device-local pattern in
 * `tours/persistence.ts`.
 *
 * IMPORTANT: reset uses `deletePersistentValue`, NOT an empty string —
 * iOS Keychain rejects empty values silently (see persistent-kv.ts), so
 * `setPersistentValue(key, '')` would leave the previous '1' in place.
 */
const INTRO_SEEN_KEY = 'pre-auth-intro-seen'

/** True once the user has gone through (or skipped past) the intro. */
export async function getIntroSeen(): Promise<boolean> {
  const raw = await getPersistentValue(INTRO_SEEN_KEY)
  return raw === '1'
}

/** Marks the intro as seen so future cold-starts skip straight to welcome. */
export async function markIntroSeen(): Promise<void> {
  await setPersistentValue(INTRO_SEEN_KEY, '1')
}

/** Clears the flag (so the intro shows again) — used by dev tooling / logout reset. */
export async function resetIntroSeen(): Promise<void> {
  await deletePersistentValue(INTRO_SEEN_KEY)
}
