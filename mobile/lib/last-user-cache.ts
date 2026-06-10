import * as SecureStore from 'expo-secure-store'

const LAST_USER_KEY = 'auth.last-user.profile'

export interface LastUserProfile {
  email: string
  displayName: string | null
  avatarSlug: string | null
  /**
   * Sprint J · J-Auth2 — when the user submitted
   * `request_account_deletion`, store the ISO scheduled_at here so the
   * welcome-screen banner can show "Tu cuenta se eliminará el X · Iniciar
   * sesión para cancelar" even before any network round-trip. Cleared
   * on successful `cancel_account_deletion`.
   */
  deletionScheduledAt: string | null
}

export async function saveLastUserProfile(profile: LastUserProfile): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      LAST_USER_KEY,
      JSON.stringify(profile),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    )
  } catch {
    // Persistence is best-effort — failure just means the next login
    // shows the first-time hero instead of the personalized one.
  }
}

export async function getLastUserProfile(): Promise<LastUserProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(LAST_USER_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<LastUserProfile>
    if (!parsed.email) return null

    return {
      email: parsed.email,
      displayName: parsed.displayName ?? null,
      avatarSlug: parsed.avatarSlug ?? null,
      deletionScheduledAt: parsed.deletionScheduledAt ?? null,
    }
  } catch {
    return null
  }
}

export async function clearLastUserProfile(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LAST_USER_KEY)
  } catch {
    // ignore
  }
}

/**
 * Patch the pending-deletion timestamp on the cached profile (preserves
 * the other fields). Used right after `request_account_deletion` so the
 * welcome-screen banner is ready by the next launch.
 */
export async function setLastUserPendingDeletion(scheduledAt: string): Promise<void> {
  const current = await getLastUserProfile()
  if (!current) return // no cached profile to patch — nothing to do
  await saveLastUserProfile({ ...current, deletionScheduledAt: scheduledAt })
}

/**
 * Patch-clear the pending-deletion timestamp. Used after a successful
 * `cancel_account_deletion`.
 */
export async function clearLastUserPendingDeletion(): Promise<void> {
  const current = await getLastUserProfile()
  if (!current) return
  if (current.deletionScheduledAt === null) return
  await saveLastUserProfile({ ...current, deletionScheduledAt: null })
}
