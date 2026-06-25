import * as SecureStore from 'expo-secure-store'

function isWeb(): boolean {
  return typeof document !== 'undefined'
}

export async function getPersistentValue(key: string): Promise<string | null> {
  if (isWeb()) {
    return globalThis.localStorage?.getItem(key) ?? null
  }

  try {
    const isAvailable = await SecureStore.isAvailableAsync()
    if (!isAvailable) {
      return null
    }

    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

export async function setPersistentValue(key: string, value: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.setItem(key, value)
    return
  }

  try {
    const isAvailable = await SecureStore.isAvailableAsync()
    if (!isAvailable) {
      return
    }

    // THIS_DEVICE_ONLY: estos valores son caches locales (fallback offline de
    // datos financieros, flags de UX) que NO deben viajar en backups cifrados
    // de iCloud/iTunes ni migrar a otro dispositivo. Mismo criterio que
    // biometric-auth.ts y last-user-cache.ts. El read no necesita la opción.
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  } catch {
    return
  }
}

/**
 * Removes a key from the persistent store. Prefer this over writing
 * an empty string when you want a fresh "absent" state — iOS Keychain
 * rejects empty values silently, so a `setPersistentValue(key, '')`
 * may leave the previous value intact and `getPersistentValue` keeps
 * returning the stale data.
 */
export async function deletePersistentValue(key: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.removeItem(key)
    return
  }

  try {
    const isAvailable = await SecureStore.isAvailableAsync()
    if (!isAvailable) {
      return
    }

    await SecureStore.deleteItemAsync(key)
  } catch {
    return
  }
}
