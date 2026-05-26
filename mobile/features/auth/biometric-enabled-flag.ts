// Persistent flag mirroring whether the user has biometric credentials
// saved on this device.
//
// Lives in AsyncStorage (unencrypted) alongside the encrypted credential
// blob in SecureStore. Acts as a tie-breaker for getBiometricLoginState
// when the SecureStore metadata read fails transiently — a single flaky
// keychain read on cold start used to make AppEntryGate bypass the
// app-lock gate (because hasSavedCredentials would collapse to false and
// the gate skips when no biometric is set up). With this flag set,
// hasSavedCredentials reads true even on a transient failure, so the
// lock screen still appears and the user authenticates (Face ID or
// password escape) instead of landing on Home unauthenticated.
//
// Why not store the flag in SecureStore: SecureStore is exactly what we
// don't fully trust at cold start. The flag's job is to be readable
// when SecureStore isn't. AsyncStorage is plain on-disk; the leak is
// "this device has biometric enabled for our app", which is already
// guessable from app behavior.

import AsyncStorage from '@react-native-async-storage/async-storage'

const BIOMETRIC_ENABLED_KEY = 'auth.biometric.enabled'
const ENABLED_VALUE = '1'

export async function setBiometricEnabledFlag(): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, ENABLED_VALUE)
}

export async function clearBiometricEnabledFlag(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY)
}

export async function isBiometricEnabledFlagSet(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)
    return value === ENABLED_VALUE
  } catch {
    // AsyncStorage failures: be conservative, don't claim biometric is
    // enabled. The keychain metadata read in getBiometricLoginState will
    // still try its own path.
    return false
  }
}
