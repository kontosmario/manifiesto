import {
  authenticateBiometricAccess,
  getBiometricLoginState,
  saveBiometricCredentials,
} from '@/lib/biometric-auth'
import { supabase } from '@/lib/supabase'

export type ActivateBiometricResult =
  | 'activated'
  | 'cancelled'
  | 'unavailable'
  | 'no-session'

/**
 * Standalone activation flow for the pre-onboarding biometric-setup
 * screen. Mirrors what `useAuthBiometricController.persistBiometricCredentials`
 * does internally, but without depending on the hook's auth-flow
 * params (clearFeedback / onErrorMessage / etc.) that don't apply
 * here.
 *
 * Returns a discriminated string the caller can map to a toast or
 * silent advance:
 *   - 'activated'     → biometry saved, can advance to onboarding
 *   - 'cancelled'     → user dismissed / failed the prompt
 *   - 'unavailable'   → hardware missing or not enrolled
 *   - 'no-session'    → session expired between signup and now
 *
 * Idempotent: if credentials already saved, returns 'activated'
 * without re-prompting.
 */
export async function activateBiometricForSession(
  email: string,
): Promise<ActivateBiometricResult> {
  // Defensive guard for edge providers (e.g. Apple Sign-In with email
  // hidden when the session somehow surfaces without a relay address).
  // `saveBiometricCredentials` silently no-ops on empty email, which
  // would otherwise leave us reporting 'activated' while no credentials
  // were stored. Treat as 'unavailable' so the caller (screen) plays
  // the warning haptic and advances without false confidence.
  if (!email) {
    return 'unavailable'
  }

  const state = await getBiometricLoginState()

  if (!state.isAvailable) {
    return 'unavailable'
  }

  if (state.hasSavedCredentials) {
    return 'activated'
  }

  const result = await authenticateBiometricAccess({
    promptMessage: `Activa ${state.label} para entrar más rápido la próxima vez.`,
  })

  if (!result.success) {
    return 'cancelled'
  }

  const sessionResponse = await supabase.auth.getSession()
  const refreshToken = sessionResponse.data.session?.refresh_token

  if (!refreshToken) {
    return 'no-session'
  }

  await saveBiometricCredentials({ email, refreshToken })

  return 'activated'
}
