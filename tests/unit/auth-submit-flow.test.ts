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

  it('deriva al pre-onboarding biometric-setup después del signup con sesión', () => {
    // Sign-up with a session goes through /(app)/biometric-setup (the
    // pre-onboarding Face ID activation gate); AppEntryGate falls
    // through to /(app)/onboarding once the flag is set.
    expect(
      resolveAuthSubmitResolution({
        hasSession: true,
        mode: 'sign-up',
      }),
    ).toEqual({
      href: '/(app)/biometric-setup',
      type: 'onboarding',
    })
  })
})
