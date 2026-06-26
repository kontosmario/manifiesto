import { Platform } from 'react-native'
import i18n from '@/lib/i18n'
import type { BiometricLoginState } from '@/lib/biometric-auth'

export function buildInitialBiometricState(): BiometricLoginState {
  return {
    hasSavedCredentials: false,
    isAvailable: false,
    label:
      Platform.OS === 'ios'
        ? 'Face ID / Touch ID'
        : i18n.t('auth:reauthSheet.biometricLabelFallback'),
  }
}
