import * as SecureStore from 'expo-secure-store'

function isWeb(): boolean {
  return typeof document !== 'undefined'
}

/**
 * expo-secure-store valida las claves contra /^[\w.-]+$/ y TIRA con
 * cualquier otra ("Invalid key provided to SecureStore") — en lectura Y
 * escritura. Los catch de abajo existen para fallas transitorias del
 * Keychain, pero también se tragaban ese error de programación: una clave
 * con ':' convertía la preferencia en una feature muerta y silenciosa
 * (tema/idioma/animaciones nunca persistieron; y el dedup del nudge
 * "Cierra tu día" tampoco — spam en prod 2026-08-23). Este warning de dev
 * hace ruido para que la clase entera de bug muera acá.
 */
function warnInvalidKeyInDev(key: string, op: string, error: unknown): void {
  if (__DEV__) {
    console.warn(
      `[persistent-kv] ${op} falló para la clave "${key}" — si el error es ` +
        '"Invalid key", la clave tiene caracteres fuera de [A-Za-z0-9._-] ' +
        '(los ":" no van) y este valor NUNCA va a persistir en native.',
      error,
    )
  }
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
  } catch (error) {
    warnInvalidKeyInDev(key, 'get', error)
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
  } catch (error) {
    warnInvalidKeyInDev(key, 'set', error)
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
  } catch (error) {
    warnInvalidKeyInDev(key, 'delete', error)
    return
  }
}
