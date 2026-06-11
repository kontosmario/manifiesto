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
import Constants from 'expo-constants'
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

// Sprint H · H5 — Bind the refresh-token blob to a successful local
// authentication challenge (Face ID / Touch ID / device passcode).
//
// Threat model:
//   `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is great at protecting the keychain
//   row from off-device extraction (no iCloud sync, no backup leak).
//   But once the device is unlocked, ANY process in our app sandbox
//   can read the row — including JS executed via a maliciously hijacked
//   OTA bundle (now hardened by F1, but defense-in-depth wins).
//
//   `requireAuthentication: true` adds OS-level access control via the
//   Secure Enclave: reading the row triggers a LocalAuthentication
//   prompt. The attacker would need a live biometric/passcode auth at
//   read time, which prevents headless exfil and aligns with the way
//   refresh-tokens already power the biometric-restore flow (the user
//   already passes Face ID before we touch this blob — iOS coalesces
//   the prompts so there is no double tap).
//
//   The non-credential metadata (just the email for UI hints) does NOT
//   need this — it's already revealed by the login screen avatar.
const credentialStoreOptionsAuthed: SecureStore.SecureStoreOptions = {
  ...credentialStoreOptions,
  requireAuthentication: true,
  authenticationPrompt:
    'Confirmá tu identidad para acceder al inicio de sesión guardado.',
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
  // Sprint F · F15: the AsyncStorage flag is read but DELIBERATELY NOT
  // included in `hasSavedCredentials`. See block below for the authority
  // model. We keep the probe so the variable stays in scope for future
  // display-hint usage and so the probe surfaces in test fixtures.
  void settledValue(enabledFlag, false)

  // Sprint F · F15 — Keychain is the sole source of truth.
  //
  // The previous implementation OR-ed `savedMetadata` with an
  // AsyncStorage flag (`auth.biometric.enabled`) so a flaky keychain
  // read couldn't collapse the gate to false. The downside: AsyncStorage
  // is plaintext and writable without root on rooted/jailbroken devices.
  // An attacker who cannot read the encrypted keychain CAN write `'1'`
  // to that key — flipping `hasSavedCredentials` to true and tricking
  // downstream code that uses this flag as an auth-gate hint. Today the
  // effect is only confused UI; tomorrow a refactor could turn it into
  // an actual bypass. We close the door now.
  //
  // The keychain metadata read is the only signal. If it transiently
  // fails (rare), the user sees the password fallback instead of the
  // Face ID CTA — that's an acceptable degradation: the worst case is
  // an extra password entry, not a silent bypass. The AsyncStorage flag
  // stays in the codebase as a fast-path display hint only (the lock
  // screen reads it to decide whether to even render the Face ID
  // button without waiting on the async keychain probe).
  return {
    hasSavedCredentials: Boolean(savedMetadata),
    isAvailable: isSecureStoreAvailable && hasHardware && isEnrolled,
    label: resolveBiometricLabel(supportedTypes),
  }
}

export async function saveBiometricCredentials(input: BiometricCredentialsPayload) {
  if (!input.email || !input.refreshToken) {
    return
  }
  // H5: credentials use the AUTHED options (Face ID gate at read time)
  // in production. In Expo Go we soften to `credentialStoreOptions` (no
  // `requireAuthentication`) for the SAME reason `authenticateBiometricAccess`
  // softens `disableDeviceFallback`: Expo Go's host binary (`host.exp.Exponent`)
  // lacks the Secure Enclave / Keychain access-control entitlements that the
  // `requireAuthentication: true` write needs to bind the row to LAContext.
  // Without softening, `SecureStore.setItemAsync` throws with an opaque
  // "InvalidArgumentException" / Keychain error (-25243 / errSecParam) and
  // the catch in settings-screen surfaces "No pudimos guardar".
  //
  // In every other runtime (dev client, EAS preview, store builds) the
  // strict gate is preserved. The read path (`getBiometricCredentials`)
  // mirrors this so dev-in-Expo-Go can save AND read.
  const saveOptions = IS_EXPO_GO ? credentialStoreOptions : credentialStoreOptionsAuthed
  if (__DEV__ && IS_EXPO_GO) {
    // eslint-disable-next-line no-console
    console.warn(
      '[biometric] Expo Go detected — saving credentials WITHOUT `requireAuthentication`. ' +
        'The strict Secure Enclave gate is preserved in dev-client / EAS / store builds.',
    )
  }
  await SecureStore.setItemAsync(
    BIOMETRIC_CREDENTIALS_KEY,
    JSON.stringify(input),
    saveOptions,
  )
  // Metadata stays plain because the biometric-login state probe needs
  // to read it WITHOUT prompting Face ID (otherwise the login screen
  // can't decide whether to render the Face ID CTA at all).
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
  // H5: write must use the same authed options used to create the row
  // so the access-control flags survive the rotation. We swallow errors:
  // a rotation that fails just means the next biometric login will
  // re-issue the same token from the prior session — not fatal.
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      JSON.stringify({
        email: metadata.email,
        refreshToken: nextToken,
      } satisfies BiometricCredentialsPayload),
      credentialStoreOptionsAuthed,
    )
  } catch {
    // best-effort
  }
}

export async function clearBiometricCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_METADATA_KEY),
    clearBiometricEnabledFlag(),
  ])
}

export async function getBiometricCredentials(): Promise<BiometricCredentialsPayload | null> {
  // H5: read must include the authed options. On iOS this triggers the
  // Face ID prompt via Secure Enclave. The biometric-restore flow
  // already shows a Face ID prompt right before this call, and iOS
  // coalesces near-simultaneous prompts into ONE — so the perceived
  // UX is unchanged. If the user cancels the OS prompt or auth fails,
  // SecureStore throws — we treat that as "no credentials available"
  // so the caller falls back to password sign-in cleanly.
  //
  // Expo Go softening (mirrors `saveBiometricCredentials`): the write in
  // Expo Go used `credentialStoreOptions` (no `requireAuthentication`)
  // because the host binary lacks the Secure Enclave entitlements. The
  // read MUST use the same options or we'd be searching the keychain
  // for an item that doesn't exist under the authed access-control flag.
  const readOptions = IS_EXPO_GO ? credentialStoreOptions : credentialStoreOptionsAuthed
  let rawValue: string | null = null
  try {
    rawValue = await SecureStore.getItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      readOptions,
    )
  } catch {
    return null
  }

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

// Expo Go's runtime identifier. Used to soften `disableDeviceFallback`
// so biometric flows can be tested with the device passcode in Expo
// Go (whose host binary lacks NSFaceIDUsageDescription on SDK 54).
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient'

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
  const requestedDisableFallback = options?.disableDeviceFallback ?? false
  // Expo Go softening: the host binary's Info.plist lacks
  // `NSFaceIDUsageDescription` on SDK 54, so strict biometric calls
  // fail upfront with `missing_usage_description` and no prompt is
  // shown. Allowing the device-passcode fallback in Expo Go lets devs
  // test the full auth flow end-to-end without spinning up a dev
  // client. In every other runtime (dev client, EAS, store builds)
  // the caller's choice is honored as-is.
  const disableDeviceFallback = IS_EXPO_GO ? false : requestedDisableFallback
  if (__DEV__ && IS_EXPO_GO && requestedDisableFallback) {
    console.warn(
      '[biometric] Expo Go detected — softening disableDeviceFallback to false so the device-passcode fallback can be tested. The strict gate is preserved in dev-client / EAS / store builds.',
    )
  }
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel:
      disableDeviceFallback || Platform.OS !== 'ios' ? undefined : 'Usar código',
    disableDeviceFallback,
    biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
  })
}
