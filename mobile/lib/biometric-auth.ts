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
import { setBiometricPromptInFlight } from '@/lib/biometric-prompt-state'
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

// Nota (2026-06-22) — POR QUÉ el blob NO usa `requireAuthentication` OS:
//   H5 lo había agregado para gatear la lectura del keychain con el Secure
//   Enclave, asumiendo que "iOS coalesce" ese prompt con el gate explícito.
//   FALSO: `expo-secure-store` (lectura/escritura authed) y
//   `expo-local-authentication` (el gate) NO comparten LAContext, así que
//   iOS dispara un prompt por CADA acceso al keychain protegido. El login
//   por Face ID terminaba pidiendo 3 veces: gate + leer token + guardar
//   token rotado. Inaceptable de UX.
//
//   Protección actual (decisión owner 2026-06-22, prioriza 1 solo prompt):
//     1. El gate `authenticateBiometricAccess()` que el flujo de login
//        SIEMPRE pasa antes de tocar el token (Face ID a nivel app).
//     2. `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: no viaja en backups/iCloud y no
//        se lee con el device bloqueado.
//   Trade-off aceptado: se resigna la defensa-en-profundidad a nivel-OS
//   contra un atacante con código DENTRO del sandbox (mitigado por la OTA
//   firmada — F1) a cambio de un único prompt biométrico.

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
  // Sin `requireAuthentication` (ver la nota arriba): la protección
  // biométrica vive en el gate `authenticateBiometricAccess()` del login, no
  // en el keychain. Evita el prompt extra al guardar + funciona idéntico en
  // Expo Go / dev client / store (ya no hay flags de Secure Enclave que Expo
  // Go no soporte).
  await SecureStore.setItemAsync(
    BIOMETRIC_CREDENTIALS_KEY,
    JSON.stringify(input),
    credentialStoreOptions,
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
  // Mismas opciones que el save (sin requireAuthentication) — así rotar el
  // token NO dispara un prompt. Best-effort: si falla, el próximo login
  // re-emite el token de la sesión previa — no es fatal.
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      JSON.stringify({
        email: metadata.email,
        refreshToken: nextToken,
      } satisfies BiometricCredentialsPayload),
      credentialStoreOptions,
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
  // Lectura SIN prompt: el blob se guarda con `credentialStoreOptions` (sin
  // requireAuthentication). El Face ID ya se pidió en el gate explícito del
  // login (`authenticateBiometricAccess`) — no queremos un segundo prompt
  // acá. Si el read falla, devolvemos null y el caller cae limpio al
  // sign-in por contraseña.
  let rawValue: string | null = null
  try {
    rawValue = await SecureStore.getItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      credentialStoreOptions,
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
  // Marcar el prompt en vuelo ANTES de presentarlo: el AppState pasa a
  // `inactive` mientras el prompt está arriba (y hasta ~1.4s después de
  // resolver) — el BackgroundSnapshotOverlay consulta este flag para NO
  // cubrir la pantalla con el cover anti-screenshot durante el prompt.
  setBiometricPromptInFlight(true)
  try {
    return await LocalAuthentication.authenticateAsync({
      promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
      cancelLabel: 'Cancelar',
      fallbackLabel:
        disableDeviceFallback || Platform.OS !== 'ios' ? undefined : 'Usar código',
      disableDeviceFallback,
      biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
    })
  } finally {
    setBiometricPromptInFlight(false)
  }
}
