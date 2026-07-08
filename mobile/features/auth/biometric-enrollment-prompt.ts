import { authenticateBiometricAccess } from '@/lib/biometric-auth'
import {
  markPrimeDismissed,
  shouldPrimePermission,
} from '@/lib/permission-prime-cooldown'
import i18n from '@/lib/i18n'

/**
 * Prompt de enrolamiento biométrico con memoria del rechazo.
 *
 * Antes, tanto el login con password (`persistBiometricCredentials`)
 * como el social (`offerBiometricEnrollmentAfterSocial`) disparaban el
 * prompt "Activa Face ID" en CADA sign-in mientras no hubiera
 * credenciales guardadas: un usuario que decía "no" lo volvía a ver en
 * todos los logins siguientes. Este helper centraliza la oferta y la
 * gatea con el mismo cooldown de 7 días (`prime_dismissed_biometric`)
 * que ya usa la pantalla de setup pre-onboarding con "Más tarde".
 *
 * Solo el rechazo explícito del usuario (`user_cancel`) arma el
 * cooldown; los fallos del sistema (`system_cancel`, lockout, etc.) no
 * cuentan como decisión y la oferta reaparece en el próximo login.
 *
 * @returns `true` si el usuario autenticó y el caller debe persistir
 * las credenciales; `false` si no se ofreció o fue rechazado.
 */
export async function promptBiometricEnrollment(label: string): Promise<boolean> {
  const allowed = await shouldPrimePermission('biometric')
  if (!allowed) {
    return false
  }

  const result = await authenticateBiometricAccess({
    promptMessage: i18n.t('auth:biometric.activatePrompt', { label }),
  })

  if (result.success) {
    return true
  }

  if (result.error === 'user_cancel') {
    await markPrimeDismissed('biometric')
  }

  return false
}
