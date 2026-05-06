import type { AuthMode } from '@/features/auth/auth-flow'

const EMAIL_CONFIRMATION_INFO =
  'Revisá tu email para confirmar la cuenta y después ingresa.'

export type AuthSubmitResolution =
  | {
      type: 'signed-in'
    }
  | {
      // Newly created accounts go straight into the 5-step onboarding
      // wizard (welcome → avatar → family → sueldo → ahorros). The
      // family decision is part of step 3, so we do NOT route through
      // /(auth)/join — that screen is reserved for established users
      // who somehow lost their family (RequireAuth fallback).
      href: '/(app)/onboarding'
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
    href: '/(app)/onboarding',
    type: 'onboarding',
  }
}
