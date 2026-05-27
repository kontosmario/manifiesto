/**
 * Pure decision fn for AppEntryGate. Returns true when the user
 * should be routed to `/(app)/biometric-setup` (the intermediate
 * activation screen between signup and the onboarding wizard).
 *
 * The decision does NOT depend on whether biometric hardware is
 * available — the screen itself renders an informative variant
 * (modo B) when there's no biometry enrolled. This guarantees every
 * brand-new account makes a conscious decision (or sees the "you can
 * activate it later" copy) before entering the wizard.
 *
 * `biometricSetupFlagLoaded` exists to avoid a routing flicker: if we
 * redirect before the persistent-kv read completes, a user who
 * already saw the screen (flag=true) would briefly land on
 * biometric-setup again before the flag resolves. Returning false
 * while the flag is loading lets the AppEntryGate render its loading
 * state instead.
 */
export function shouldShowBiometricSetup(input: {
  sessionUserId: string | null | undefined
  onboardingCompletedAt: string | null | undefined
  biometricSetupShown: boolean
  biometricSetupFlagLoaded: boolean
}): boolean {
  return Boolean(
    input.sessionUserId &&
      !input.onboardingCompletedAt &&
      !input.biometricSetupShown &&
      input.biometricSetupFlagLoaded,
  )
}
