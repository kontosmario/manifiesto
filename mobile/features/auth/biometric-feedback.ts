// Maps a LocalAuthentication error code to user-facing feedback.
//
// Lockout states get a differentiated message. Cancels (user_cancel,
// system_cancel, app_cancel, user_fallback) are silent — either the
// user dismissed intentionally or the system closed the prompt.
// Unavailability errors (not_available, not_enrolled, passcode_not_set)
// get an actionable "go to Settings" nudge. Everything else falls back
// to a generic "use your password" message so the user is never stuck
// without guidance.

export interface BiometricFeedback {
  message: string
}

const LOCKOUT_ERRORS: ReadonlySet<string> = new Set([
  'lockout',
  'lockout_permanent',
])

const UNAVAILABLE_ERRORS: ReadonlySet<string> = new Set([
  'not_available',
  'not_enrolled',
  'passcode_not_set',
])

const SILENT_ERRORS: ReadonlySet<string> = new Set([
  'user_cancel',
  'system_cancel',
  'app_cancel',
  'user_fallback',
])

export function biometricFeedbackForError(
  error: string | undefined,
  label: string,
): BiometricFeedback | null {
  if (!error) return null
  if (SILENT_ERRORS.has(error)) return null
  if (LOCKOUT_ERRORS.has(error)) {
    return {
      message: `${label} está bloqueado por varios intentos. Usa tu contraseña para entrar.`,
    }
  }
  if (UNAVAILABLE_ERRORS.has(error)) {
    return {
      message: `${label} no está disponible. Revisa Ajustes → Manifiesto → Face ID o usa tu contraseña.`,
    }
  }
  // Catch-all for any other non-cancel failure (e.g. authentication_failed,
  // invalid_context, unknown). Don't leave the user stuck without feedback.
  return {
    message: `No pudimos iniciar ${label}. Usa tu contraseña para entrar.`,
  }
}
