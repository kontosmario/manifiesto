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

    await SecureStore.setItemAsync(key, value)
  } catch {
    return
  }
}
