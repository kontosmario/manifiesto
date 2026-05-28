// Persistent flag mirroring whether a PIN is set on this device.
// Lives in AsyncStorage (unencrypted) alongside the salted hash in
// SecureStore. Same tie-breaker role as `biometric-enabled-flag`: a
// flaky keychain read on cold start must NOT make AppEntryGate bypass
// the lock (which would land the user on Home unauthenticated). With
// this flag set, `getPinLockState().isSet` reads true even on a
// transient SecureStore failure.
//
// Leak surface is "this device has a PIN for our app", already
// guessable from app behavior — acceptable, same call as the
// biometric flag.

import AsyncStorage from '@react-native-async-storage/async-storage'

const PIN_ENABLED_KEY = 'app-lock.pin.enabled'
const ENABLED_VALUE = '1'

export async function setPinEnabledFlag(): Promise<void> {
  await AsyncStorage.setItem(PIN_ENABLED_KEY, ENABLED_VALUE)
}

export async function clearPinEnabledFlag(): Promise<void> {
  await AsyncStorage.removeItem(PIN_ENABLED_KEY)
}

export async function isPinEnabledFlagSet(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PIN_ENABLED_KEY)
    return value === ENABLED_VALUE
  } catch {
    return false
  }
}
