// Ruteo post-auth puro. Reemplaza la cascada de Redirects de
// AppEntryGate. El orden de precedencia replica el del gate viejo:
// biometric-setup → onboarding → join → home. `showBiometricSetup`
// llega ya computado por `shouldShowBiometricSetup` (adapter).

export interface ResolveDestinationInput {
  onboardingCompletedAt: string | null
  hasFamily: boolean
  showBiometricSetup: boolean
}

export function resolveDestination(input: ResolveDestinationInput): string {
  if (!input.onboardingCompletedAt) {
    if (input.showBiometricSetup) return '/(app)/biometric-setup'
    return '/(app)/onboarding'
  }
  if (!input.hasFamily) return '/(auth)/join'
  return '/(app)/(tabs)/home'
}
