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

  try {
    const [isSecureStoreAvailable, hasHardware, isEnrolled, supportedTypes, metadata] = await Promise.all([
      SecureStore.isAvailableAsync(),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      readBiometricMetadata(),
    ])

    return {
      hasSavedCredentials: Boolean(metadata),
      isAvailable: isSecureStoreAvailable && hasHardware && isEnrolled,
      label: resolveBiometricLabel(supportedTypes),
    }
  } catch {
    return {
      hasSavedCredentials: false,
      isAvailable: false,
      label: getDefaultBiometricLabel(),
    }
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
  options?: { promptMessage?: string },
) {
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel: Platform.OS === 'ios' ? 'Usar código' : undefined,
    disableDeviceFallback: false,
    biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
  })
}
