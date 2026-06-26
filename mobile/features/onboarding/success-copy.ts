// Pure copy resolver for the success screen shown after the 5-step
// onboarding wizard finishes. Variants on (kind, firstName).
import i18n from '@/lib/i18n'

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
  const title = trimmedName
    ? i18n.t('onboarding:success.titleNamed', { name: trimmedName })
    : i18n.t('onboarding:success.title')
  const subtitle =
    input.kind === 'solo'
      ? i18n.t('onboarding:success.subtitleSolo')
      : i18n.t('onboarding:success.subtitleShared')
  return {
    eyebrow: i18n.t('onboarding:success.eyebrow'),
    title,
    subtitle,
    ctaLabel: i18n.t('onboarding:success.cta'),
  }
}
