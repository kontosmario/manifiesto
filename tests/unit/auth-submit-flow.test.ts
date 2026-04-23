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
      infoMessage: 'Revisá tu email para confirmar la cuenta y después ingresá.',
      type: 'email-confirmation',
    })
  })

  it('deriva siempre al selector de familia después del signup con sesión', () => {
    expect(
      resolveAuthSubmitResolution({
        hasSession: true,
        mode: 'sign-up',
      }),
    ).toEqual({
      href: '/(auth)/join',
      type: 'join',
    })
  })
})
