// Maps a LocalAuthentication error code to user-facing feedback.
//
// Only lockout states get a differentiated message (telling the user to
// fall back to their password). Cancels are silent (the user chose to
// dismiss). Everything else returns null — the caller already fires a
// generic warning haptic for non-cancel failures.

export interface BiometricFeedback {
  message: string
}

export function biometricFeedbackForError(
  error: string | undefined,
  label: string,
): BiometricFeedback | null {
  if (error === 'lockout' || error === 'lockout_permanent') {
    return {
      message: `${label} está bloqueado por varios intentos. Usá tu contraseña para entrar.`,
    }
  }
  return null
}
