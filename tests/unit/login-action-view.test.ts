import { describe, expect, it } from 'vitest'
import { resolveLoginActionView } from '@/features/auth/login-action-view'

describe('resolveLoginActionView', () => {
  it('formMode tiene precedencia: muestra el formulario de contraseña', () => {
    expect(
      resolveLoginActionView({
        formMode: 'use-password',
        isLockMode: false,
        hasSavedBiometric: true,
        isReturningUser: true,
      }),
    ).toBe('password-form')
    // incluso en lock mode, si el usuario eligió explícitamente la
    // contraseña respetamos esa elección
    expect(
      resolveLoginActionView({
        formMode: 'change-account',
        isLockMode: true,
        hasSavedBiometric: false,
        isReturningUser: true,
      }),
    ).toBe('password-form')
  })

  it('lock mode SIEMPRE muestra el CTA Face ID aunque el re-sondeo dé false', () => {
    // Regresión: abrir la app ya logueado (lock mode) y que el re-sondeo
    // async de getBiometricLoginState devuelva hasSavedBiometric=false
    // NO debe esconder el botón de biometría. Llegamos a lock mode solo
    // porque la biometría está habilitada (AppEntryGate ya lo verificó).
    expect(
      resolveLoginActionView({
        formMode: null,
        isLockMode: true,
        hasSavedBiometric: false,
        isReturningUser: true,
      }),
    ).toBe('face-id')
  })

  it('con biometría guardada muestra el CTA Face ID', () => {
    expect(
      resolveLoginActionView({
        formMode: null,
        isLockMode: false,
        hasSavedBiometric: true,
        isReturningUser: true,
      }),
    ).toBe('face-id')
  })

  it('usuario que vuelve sin biometría (y sin lock) muestra solo acciones secundarias', () => {
    expect(
      resolveLoginActionView({
        formMode: null,
        isLockMode: false,
        hasSavedBiometric: false,
        isReturningUser: true,
      }),
    ).toBe('secondary-only')
  })

  it('sin nada resuelto todavía devuelve "none"', () => {
    expect(
      resolveLoginActionView({
        formMode: null,
        isLockMode: false,
        hasSavedBiometric: false,
        isReturningUser: false,
      }),
    ).toBe('none')
  })
})
