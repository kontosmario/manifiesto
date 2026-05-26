// Biometric session restore — refresh-token flow.
//
// Why this is NOT password-based:
//   The previous implementation persisted the user's plaintext
//   password in Keychain ("biometric credentials") and re-ran
//   `signInWithPassword` after Face ID succeeded. That multiplied
//   the blast radius of any Keychain compromise (jailbroken device
//   + Keychain dumper) into "attacker recovers the user's reusable
//   password" — which often unlocks email + other services.
//
//   The refresh-token approach:
//     • App-scoped (only valid against this Supabase project).
//     • Rotatable (Supabase rotates on every refresh; we update the
//       stored token after each successful refresh).
//     • Revocable (the user can sign out everywhere, invalidating
//       it; the user's password keeps working).
//
//   The Keychain entry is bound to WHEN_UNLOCKED_THIS_DEVICE_ONLY
//   so it never travels in iCloud/iTunes backups.

import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import {
  clearBiometricEnabledFlag,
  isBiometricEnabledFlagSet,
  setBiometricEnabledFlag,
} from '@/features/auth/biometric-enabled-flag'

const BIOMETRIC_CREDENTIALS_KEY = 'auth.biometric.credentials'
const BIOMETRIC_METADATA_KEY = 'auth.biometric.metadata'

interface BiometricCredentialsPayload {
  email: string
  /** Supabase refresh token. Used with `auth.refreshSession({ refresh_token })`
   *  to mint a new session after biometric confirmation. Never the password. */
  refreshToken: string
}

interface BiometricMetadataPayload {
  email: string
}

export interface BiometricLoginState {
  hasSavedCredentials: boolean
  isAvailable: boolean
  label: string
}

const credentialStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

function getDefaultBiometricLabel() {
  return Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'biometría'
}

function resolveBiometricLabel(types: LocalAuthentication.AuthenticationType[]) {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'reconocimiento facial'
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'huella digital'
  }

  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris'
  }

  return getDefaultBiometricLabel()
}

async function readBiometricMetadata() {
  const rawValue = await SecureStore.getItemAsync(BIOMETRIC_METADATA_KEY, credentialStoreOptions)

  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<BiometricMetadataPayload>
    if (!parsed.email) {
      return null
    }

    return {
      email: parsed.email,
    }
  } catch {
    return null
  }
}

export async function getBiometricLoginState(): Promise<BiometricLoginState> {
  if (Platform.OS === 'web') {
    return {
      hasSavedCredentials: false,
      isAvailable: false,
      label: getDefaultBiometricLabel(),
    }
  }

  // Probe each signal INDEPENDENTLY. A previous `Promise.all` + single
  // `catch` was all-or-nothing: if any one of the five reads rejected
  // (a transient SecureStore / LocalAuthentication hiccup) the whole
  // function returned `{ isAvailable: false, hasSavedCredentials: false }`.
  // On the lock screen that flipped `hasSavedBiometric` to false mid-
  // session and hid the only valid action (the Face ID CTA). With
  // `allSettled` a single failing read degrades just that signal — the
  // others (notably the saved-credential metadata) survive.
  const [secureStore, hardware, enrolled, types, metadata, enabledFlag] = await Promise.allSettled([
    SecureStore.isAvailableAsync(),
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
    readBiometricMetadata(),
    isBiometricEnabledFlagSet(),
  ])

  const settledValue = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
    result.status === 'fulfilled' ? result.value : fallback

  const isSecureStoreAvailable = settledValue(secureStore, false)
  const hasHardware = settledValue(hardware, false)
  const isEnrolled = settledValue(enrolled, false)
  const supportedTypes = settledValue(types, [] as LocalAuthentication.AuthenticationType[])
  const savedMetadata = settledValue(metadata, null)
  const flagIsSet = settledValue(enabledFlag, false)

  // `hasSavedCredentials` is the OR of two signals so a transient
  // SecureStore failure can't collapse it to false and bypass the
  // app-lock gate. The keychain metadata is the source of truth when
  // readable; the AsyncStorage flag is a non-encrypted mirror that
  // survives a flaky keychain read. Both are set on save and cleared
  // on logout in lock-step.
  return {
    hasSavedCredentials: Boolean(savedMetadata) || flagIsSet,
    isAvailable: isSecureStoreAvailable && hasHardware && isEnrolled,
    label: resolveBiometricLabel(supportedTypes),
  }
}

export async function saveBiometricCredentials(input: BiometricCredentialsPayload) {
  if (!input.email || !input.refreshToken) {
    return
  }
  await SecureStore.setItemAsync(
    BIOMETRIC_CREDENTIALS_KEY,
    JSON.stringify(input),
    credentialStoreOptions,
  )
  await SecureStore.setItemAsync(
    BIOMETRIC_METADATA_KEY,
    JSON.stringify({
      email: input.email,
    } satisfies BiometricMetadataPayload),
    credentialStoreOptions,
  )
  await setBiometricEnabledFlag()
}

/**
 * Update only the stored refresh token (called after each successful
 * biometric session restore so we keep up with Supabase's refresh
 * token rotation). Returns silently if no prior credentials exist.
 */
export async function updateStoredRefreshToken(nextToken: string) {
  if (!nextToken) return
  const metadata = await readBiometricMetadata()
  if (!metadata) return
  await SecureStore.setItemAsync(
    BIOMETRIC_CREDENTIALS_KEY,
    JSON.stringify({
      email: metadata.email,
      refreshToken: nextToken,
    } satisfies BiometricCredentialsPayload),
    credentialStoreOptions,
  )
}

export async function clearBiometricCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_METADATA_KEY),
    clearBiometricEnabledFlag(),
  ])
}

export async function getBiometricCredentials(): Promise<BiometricCredentialsPayload | null> {
  const rawValue = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY, credentialStoreOptions)

  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<BiometricCredentialsPayload> & {
      // Older builds may have stored a plaintext password here. Treat
      // any such legacy blob as invalid so we never re-issue a
      // password-based sign-in. The user re-authenticates with email
      // + password once and we re-save with the refresh token.
      password?: string
    }

    if (!parsed.email || !parsed.refreshToken) {
      return null
    }

    return {
      email: parsed.email,
      refreshToken: parsed.refreshToken,
    }
  } catch {
    return null
  }
}

// Android API 30 (Android 11) introduced support for
// `BIOMETRIC_STRONG | DEVICE_CREDENTIAL` as a combined authenticator.
// On API 29 (Android 10) AndroidX's `BiometricPrompt.PromptInfo.Builder.build()`
// throws `IllegalArgumentException: Authenticator combination is
// unsupported on API 29: BIOMETRIC_STRONG | DEVICE_CREDENTIAL` when
// `biometricsSecurityLevel: 'strong'` is paired with
// `disableDeviceFallback: false`. We downgrade the requirement to
// `'weak'` on older Android — the combo `BIOMETRIC_WEAK |
// DEVICE_CREDENTIAL` IS supported on API 29, and on real S9-class
// devices most enrolled biometrics already register as WEAK (Google's
// strict criteria for STRONG excluded a lot of pre-2020 hardware), so
// the user-visible UX is unchanged.
const ANDROID_REQUIRES_WEAK_BIOMETRIC =
  Platform.OS === 'android' &&
  typeof Platform.Version === 'number' &&
  Platform.Version < 30

export async function authenticateBiometricAccess(
  options?: { promptMessage?: string; disableDeviceFallback?: boolean },
) {
  // When the caller wants a strict biometric gate (no device-passcode
  // fallback — used by the app-lock screen) we also clear fallbackLabel
  // so the OS doesn't offer "Usar código"; the in-app "Usar contraseña"
  // button is the escape hatch instead.
  const disableDeviceFallback = options?.disableDeviceFallback ?? false
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel:
      disableDeviceFallback || Platform.OS !== 'ios' ? undefined : 'Usar código',
    disableDeviceFallback,
    biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
  })
}
