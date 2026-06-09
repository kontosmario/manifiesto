import { describe, expect, it } from 'vitest'
import { isEmailNotConfirmedError } from '@/features/auth/email-confirmation-error'

describe('isEmailNotConfirmedError', () => {
  it('detecta el código moderno de Supabase', () => {
    expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true)
  })

  it('detecta el mensaje plano legacy', () => {
    expect(
      isEmailNotConfirmedError({ message: 'Email not confirmed' }),
    ).toBe(true)
  })

  it('detecta el mensaje en cualquier capitalización', () => {
    expect(
      isEmailNotConfirmedError({ message: 'email not confirmed' }),
    ).toBe(true)
  })

  it('rechaza errores de password inválido', () => {
    expect(
      isEmailNotConfirmedError({ message: 'Invalid login credentials' }),
    ).toBe(false)
  })

  it('rechaza valores nulos / no-objetos', () => {
    expect(isEmailNotConfirmedError(null)).toBe(false)
    expect(isEmailNotConfirmedError(undefined)).toBe(false)
    expect(isEmailNotConfirmedError('Email not confirmed')).toBe(false)
  })

  it('no confunde "Email link is invalid" con el caso unconfirmed', () => {
    expect(
      isEmailNotConfirmedError({
        message: 'Email link is invalid or has expired',
      }),
    ).toBe(false)
  })
})
