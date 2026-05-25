// Pure decision for which action block the login screen renders.
//
// Extracted from the inline ternary in `login-screen.tsx` so the rule
// is explicit and testable — in particular the lock-mode invariant
// below, which is a regression guard.
//
// LOCK MODE INVARIANT:
//   When the screen runs in lock mode (`?lock=1`) the user already has
//   a valid session AND biometrics are enrolled — AppEntryGate only
//   routes here when `shouldUseBiometric === true`. The Face ID CTA is
//   therefore the *only* sensible primary action and MUST always be
//   shown, even if the async re-probe (`getBiometricLoginState`)
//   transiently reports `hasSavedBiometric === false` (e.g. a SecureStore
//   hiccup that trips the all-or-nothing catch). Gating the CTA on that
//   re-probe is what made the button vanish on cancel — leaving only
//   "Usar contraseña"/"Cambiar cuenta", which are nonsensical for an
//   already-authenticated user.

export type LoginActionView = 'password-form' | 'face-id' | 'secondary-only' | 'none'

export interface LoginActionViewInput {
  /** Active password form mode, or null when no form is open. */
  formMode: 'use-password' | 'change-account' | null
  /** `?lock=1` — per-launch biometric re-confirmation for a valid session. */
  isLockMode: boolean
  /** Re-probed `biometricState.isAvailable && hasSavedCredentials`. */
  hasSavedBiometric: boolean
  /** Has saved biometric OR a cached last-user profile. */
  isReturningUser: boolean
}

export function resolveLoginActionView({
  formMode,
  isLockMode,
  hasSavedBiometric,
  isReturningUser,
}: LoginActionViewInput): LoginActionView {
  // The user's explicit choice (tapped "Usar contraseña" / "Cambiar
  // cuenta") always wins, even in lock mode — it's their escape hatch.
  if (formMode) return 'password-form'

  // Lock mode forces the Face ID CTA regardless of the re-probe (see
  // LOCK MODE INVARIANT above).
  if (isLockMode || hasSavedBiometric) return 'face-id'

  if (isReturningUser) return 'secondary-only'

  return 'none'
}
