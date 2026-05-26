// Pure copy resolver for the success screen shown after the 5-step
// onboarding wizard finishes. Variants on (kind, firstName).

export interface OnboardingSuccessInput {
  kind: 'solo' | 'shared'
  firstName: string
}

export interface OnboardingSuccessCopy {
  eyebrow: string
  title: string
  subtitle: string
  ctaLabel: string
}

export function onboardingSuccessCopy(
  input: OnboardingSuccessInput,
): OnboardingSuccessCopy {
  const trimmedName = input.firstName.trim()
  const title = trimmedName ? `¡Listo, ${trimmedName}!` : '¡Listo!'
  const subtitle =
    input.kind === 'solo'
      ? 'Tu espacio personal ya está armado. Vamos a Home.'
      : 'Tu familia ya está armada. Vamos a Home.'
  return {
    eyebrow: 'Bienvenido a Manifiesto',
    title,
    subtitle,
    ctaLabel: 'Empezar',
  }
}
