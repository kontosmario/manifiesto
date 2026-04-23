import type { AuthMode } from '@/features/auth/auth-flow'

const EMAIL_CONFIRMATION_INFO =
  'Revisá tu email para confirmar la cuenta y después ingresá.'

export type AuthSubmitResolution =
  | {
      type: 'signed-in'
    }
  | {
      href: '/(auth)/join'
      type: 'join'
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
    href: '/(auth)/join',
    type: 'join',
  }
}
