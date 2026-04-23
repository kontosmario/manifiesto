import { Platform } from 'react-native'
import type { BiometricLoginState } from '@/lib/biometric-auth'

export function buildInitialBiometricState(): BiometricLoginState {
  return {
    hasSavedCredentials: false,
    isAvailable: false,
    label: Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'biometría',
  }
}
