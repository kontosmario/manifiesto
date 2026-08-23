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
    // Hasta que el probe real resuelva: en Android el sensor dominante
    // es la huella (el probe lo confirma o corrige enseguida); iOS
    // arranca genérico porque Face ID/Touch ID dependen del modelo.
    sensor: Platform.OS === 'android' ? 'fingerprint' : 'generic',
  }
}
