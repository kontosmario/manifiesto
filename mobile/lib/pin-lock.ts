// PIN-based app lock — salted SHA-256 hash in SecureStore.
//
// Threat model: a CASUAL lock (someone picks up an unlocked phone),
// NOT cryptographic defense. A 4-digit PIN has 10k combinations; an
// attacker who can dump the Keychain can brute-force it. The real
// secret (the Supabase refresh token) already lives in Keychain
// WHEN_UNLOCKED_THIS_DEVICE_ONLY. The hash here just avoids storing
// the PIN in plaintext; the salt avoids cross-device rainbow reuse.
//
// Hashing is pure-JS (js-sha256) on purpose: adding a native crypto
// module (expo-crypto / expo-standard-web-crypto) would require a
// dev-client rebuild — `expo-standard-web-crypto` already crashed the
// app once on a missing `ExpoCryptoAES` native module. Pure-JS runs
// on Hermes with no rebuild.

import * as SecureStore from 'expo-secure-store'
import { sha256 } from 'js-sha256'
import {
  clearPinEnabledFlag,
  isPinEnabledFlagSet,
  setPinEnabledFlag,
} from '@/features/auth/pin-enabled-flag'

const PIN_HASH_KEY = 'app-lock.pin.hash'
const PIN_SALT_KEY = 'app-lock.pin.salt'

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const PIN_PATTERN = /^\d{4}$/

// Non-crypto salt is sufficient here (see threat model above): its only
// job is per-device uniqueness so the same PIN hashes differently on
// two devices, defeating precomputed tables. 32 hex chars.
function randomSalt(): string {
  let salt = ''
  for (let i = 0; i < 32; i++) {
    salt += Math.floor(Math.random() * 16).toString(16)
  }
  return salt
}

function hashPin(salt: string, pin: string): string {
  return sha256(salt + pin)
}

export async function setPin(pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('El PIN debe tener exactamente 4 dígitos.')
  }
  const salt = randomSalt()
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt, storeOptions)
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(salt, pin), storeOptions)
  await setPinEnabledFlag()
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const salt = await SecureStore.getItemAsync(PIN_SALT_KEY, storeOptions)
    const hash = await SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions)
    if (!salt || !hash) return false
    return hashPin(salt, pin) === hash
  } catch {
    return false
  }
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY)
  await SecureStore.deleteItemAsync(PIN_SALT_KEY)
  await clearPinEnabledFlag()
}

export async function getPinLockState(): Promise<{ isSet: boolean }> {
  // OR of two signals (same pattern as biometric `hasSavedCredentials`):
  // the keychain hash when readable, plus the AsyncStorage flag as a
  // tie-breaker so a transient keychain failure can't bypass the lock.
  const [hashResult, flagResult] = await Promise.allSettled([
    SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions),
    isPinEnabledFlagSet(),
  ])
  const hasHash =
    hashResult.status === 'fulfilled' && Boolean(hashResult.value)
  const flagSet = flagResult.status === 'fulfilled' && flagResult.value === true
  return { isSet: hasHash || flagSet }
}
