import * as SecureStore from 'expo-secure-store'

const LAST_USER_KEY = 'auth.last-user.profile'

export interface LastUserProfile {
  email: string
  displayName: string | null
  avatarSlug: string | null
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
