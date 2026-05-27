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
  const state = await getBiometricLoginState()

  if (!state.isAvailable) {
    return 'unavailable'
  }

  if (state.hasSavedCredentials) {
    return 'activated'
  }

  const result = await authenticateBiometricAccess({
    promptMessage: `Activá ${state.label} para entrar más rápido la próxima vez.`,
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
