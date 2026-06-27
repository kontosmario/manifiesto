import { describe, expect, it } from 'vitest'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'

describe('biometricFeedbackForError', () => {
  // ── Lockout ──────────────────────────────────────────────────────────────
  it('lockout → copy diferenciada con el label', () => {
    expect(biometricFeedbackForError('lockout', 'Face ID')).toEqual({
      message: 'Face ID está bloqueado por varios intentos. Usa tu contraseña para entrar.',
    })
  })

  it('lockout_permanent → misma copy', () => {
    expect(biometricFeedbackForError('lockout_permanent', 'Touch ID')).toEqual({
      message: 'Touch ID está bloqueado por varios intentos. Usa tu contraseña para entrar.',
    })
  })

  // ── Cancels / silent ─────────────────────────────────────────────────────
  it('user_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('user_cancel', 'Face ID')).toBeNull()
  })

  it('system_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('system_cancel', 'Face ID')).toBeNull()
  })

  it('app_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('app_cancel', 'Face ID')).toBeNull()
  })

  it('user_fallback → null (el usuario eligió el fallback in-app, el formulario de contraseña lo maneja)', () => {
    expect(biometricFeedbackForError('user_fallback', 'Face ID')).toBeNull()
  })

  // ── Unavailability ────────────────────────────────────────────────────────
  it('not_available → mensaje de ajustes con el label', () => {
    expect(biometricFeedbackForError('not_available', 'Face ID')).toEqual({
      message: 'Face ID no está disponible. Revisa Ajustes → Manifiesto → Face ID o usa tu contraseña.',
    })
  })

  it('not_enrolled → mensaje de ajustes con el label', () => {
    expect(biometricFeedbackForError('not_enrolled', 'Touch ID')).toEqual({
      message: 'Touch ID no está disponible. Revisa Ajustes → Manifiesto → Face ID o usa tu contraseña.',
    })
  })

  it('passcode_not_set → mensaje de ajustes con el label', () => {
    expect(biometricFeedbackForError('passcode_not_set', 'Face ID')).toEqual({
      message: 'Face ID no está disponible. Revisa Ajustes → Manifiesto → Face ID o usa tu contraseña.',
    })
  })

  // ── Catch-all / undefined ─────────────────────────────────────────────────
  it('authentication_failed (error desconocido) → mensaje genérico de fallback', () => {
    expect(biometricFeedbackForError('authentication_failed', 'Face ID')).toEqual({
      message: 'No pudimos iniciar Face ID. Usa tu contraseña para entrar.',
    })
  })

  it('cualquier otro código no reconocido → mensaje genérico de fallback', () => {
    expect(biometricFeedbackForError('unknown_error_code', 'Touch ID')).toEqual({
      message: 'No pudimos iniciar Touch ID. Usa tu contraseña para entrar.',
    })
  })

  it('undefined → null (defensivo, no debería ocurrir para non-success)', () => {
    expect(biometricFeedbackForError(undefined, 'Face ID')).toBeNull()
  })
})
