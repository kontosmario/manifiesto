import type { AuthMode } from '@/features/auth/auth-flow'

const EMAIL_CONFIRMATION_INFO =
  'Revisa tu email para confirmar la cuenta y después ingresa.'

export type AuthSubmitResolution =
  | {
      type: 'signed-in'
    }
  | {
      // Newly created accounts go through the pre-onboarding biometric
      // setup gate first (activate Face ID before the wizard), then
      // into the 5-step onboarding wizard (welcome → avatar → family
      // → sueldo → ahorros). The family decision is part of step 3, so
      // we do NOT route through /(auth)/join — that screen is reserved
      // for established users who somehow lost their family
      // (RequireAuth fallback). AppEntryGate falls through to
      // /(app)/onboarding if the user already saw biometric-setup.
      href: '/(app)/biometric-setup'
      type: 'onboarding'
    }
  | {
      infoMessage: string
      type: 'email-confirmation'
    }

export function resolveAuthSubmitResolution({
  hasSession,
  mode,
}: {
  hasSession: boolean
  mode: AuthMode
}): AuthSubmitResolution {
  if (mode === 'sign-in') {
    return {
      type: 'signed-in',
    }
  }

  if (!hasSession) {
    return {
      infoMessage: EMAIL_CONFIRMATION_INFO,
      type: 'email-confirmation',
    }
  }

  return {
    href: '/(app)/biometric-setup',
    type: 'onboarding',
  }
}
