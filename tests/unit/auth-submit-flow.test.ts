import { describe, expect, it } from 'vitest'
import { resolveAuthSubmitResolution } from '@/features/auth/auth-submit-flow'

describe('auth-submit-flow', () => {
  it('mantiene sign-in como acceso directo al home', () => {
    expect(
      resolveAuthSubmitResolution({
        hasSession: true,
        mode: 'sign-in',
      }),
    ).toEqual({
      type: 'signed-in',
    })
  })

  it('envía a confirmación por mail cuando signup no devuelve sesión', () => {
    expect(
      resolveAuthSubmitResolution({
        hasSession: false,
        mode: 'sign-up',
      }),
    ).toEqual({
      // Copy refreshed during V1 refactor.
      infoMessage: 'Revisá tu email para confirmar la cuenta y después ingresa.',
      type: 'email-confirmation',
    })
  })

  it('deriva al onboarding después del signup con sesión', () => {
    // Post-refactor: sign-up with a session no longer routes to /(auth)/join — it goes through the onboarding wizard.
    expect(
      resolveAuthSubmitResolution({
        hasSession: true,
        mode: 'sign-up',
      }),
    ).toEqual({
      href: '/(app)/onboarding',
      type: 'onboarding',
    })
  })
})
