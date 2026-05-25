import { describe, expect, it } from 'vitest'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'

describe('biometricFeedbackForError', () => {
  it('lockout → copy diferenciada con el label', () => {
    expect(biometricFeedbackForError('lockout', 'Face ID')).toEqual({
      message: 'Face ID está bloqueado por varios intentos. Usá tu contraseña para entrar.',
    })
  })

  it('lockout_permanent → misma copy', () => {
    expect(biometricFeedbackForError('lockout_permanent', 'Touch ID')).toEqual({
      message: 'Touch ID está bloqueado por varios intentos. Usá tu contraseña para entrar.',
    })
  })

  it('user_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('user_cancel', 'Face ID')).toBeNull()
  })

  it('system_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('system_cancel', 'Face ID')).toBeNull()
  })

  it('error desconocido o undefined → null', () => {
    expect(biometricFeedbackForError('authentication_failed', 'Face ID')).toBeNull()
    expect(biometricFeedbackForError(undefined, 'Face ID')).toBeNull()
  })
})
