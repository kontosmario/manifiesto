import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const BIOMETRIC_CREDENTIALS_KEY = 'auth.biometric.credentials'
const BIOMETRIC_METADATA_KEY = 'auth.biometric.metadata'

interface BiometricCredentialsPayload {
  email: string
  password: string
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
  const rawValue = await SecureStore.getItemAsync(BIOMETRIC_METADATA_KEY)

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
  await SecureStore.setItemAsync(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify(input), credentialStoreOptions)
  await SecureStore.setItemAsync(
    BIOMETRIC_METADATA_KEY,
    JSON.stringify({
      email: input.email,
    } satisfies BiometricMetadataPayload),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
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
    const parsed = JSON.parse(rawValue) as Partial<BiometricCredentialsPayload>

    if (!parsed.email || !parsed.password) {
      return null
    }

    return {
      email: parsed.email,
      password: parsed.password,
    }
  } catch {
    return null
  }
}

export async function authenticateBiometricAccess(
  options?: { promptMessage?: string },
) {
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel: Platform.OS === 'ios' ? 'Usar código' : undefined,
    disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong',
  })
}
