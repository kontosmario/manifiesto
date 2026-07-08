import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => store.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

const authenticateBiometricAccess = vi.fn()

vi.mock('@/lib/biometric-auth', () => ({
  authenticateBiometricAccess: (...args: unknown[]) => authenticateBiometricAccess(...args),
}))

vi.mock('@/lib/i18n', () => ({
  default: {
    t: (key: string, opts?: { label?: string }) =>
      opts?.label ? `${key}:${opts.label}` : key,
  },
}))

import { promptBiometricEnrollment } from '@/features/auth/biometric-enrollment-prompt'

const DAY_MS = 24 * 60 * 60 * 1000
const COOLDOWN_KEY = 'prime_dismissed_biometric'

beforeEach(() => {
  store.clear()
  authenticateBiometricAccess.mockReset()
})

describe('promptBiometricEnrollment', () => {
  it('promptea con el copy de activación y devuelve true si el usuario acepta', async () => {
    authenticateBiometricAccess.mockResolvedValue({ success: true })

    const accepted = await promptBiometricEnrollment('Face ID')

    expect(accepted).toBe(true)
    expect(authenticateBiometricAccess).toHaveBeenCalledWith({
      promptMessage: 'auth:biometric.activatePrompt:Face ID',
    })
  })

  it('NO promptea si el rechazo está dentro del cooldown de 7 días', async () => {
    store.set(COOLDOWN_KEY, String(Date.now() - 1 * DAY_MS))

    const accepted = await promptBiometricEnrollment('Face ID')

    expect(accepted).toBe(false)
    expect(authenticateBiometricAccess).not.toHaveBeenCalled()
  })

  it('vuelve a promptear cuando el rechazo tiene más de 7 días', async () => {
    store.set(COOLDOWN_KEY, String(Date.now() - 8 * DAY_MS))
    authenticateBiometricAccess.mockResolvedValue({ success: true })

    const accepted = await promptBiometricEnrollment('Face ID')

    expect(accepted).toBe(true)
    expect(authenticateBiometricAccess).toHaveBeenCalledTimes(1)
  })

  it('persiste el rechazo del usuario (user_cancel) — el siguiente login no re-promptea', async () => {
    authenticateBiometricAccess.mockResolvedValue({ success: false, error: 'user_cancel' })

    const first = await promptBiometricEnrollment('Face ID')
    const second = await promptBiometricEnrollment('Face ID')

    expect(first).toBe(false)
    expect(second).toBe(false)
    // El segundo intento quedó gateado por el cooldown: un solo prompt.
    expect(authenticateBiometricAccess).toHaveBeenCalledTimes(1)
    expect(store.has(COOLDOWN_KEY)).toBe(true)
  })

  it('NO persiste rechazos que no son intención del usuario (system_cancel)', async () => {
    authenticateBiometricAccess.mockResolvedValue({ success: false, error: 'system_cancel' })

    await promptBiometricEnrollment('Face ID')
    await promptBiometricEnrollment('Face ID')

    // Sin dismissal persistido, cada intento vuelve a ofrecer.
    expect(authenticateBiometricAccess).toHaveBeenCalledTimes(2)
    expect(store.has(COOLDOWN_KEY)).toBe(false)
  })

  it('el éxito no escribe dismissal (no bloquea futuros flujos)', async () => {
    authenticateBiometricAccess.mockResolvedValue({ success: true })

    await promptBiometricEnrollment('Face ID')

    expect(store.has(COOLDOWN_KEY)).toBe(false)
  })
})
