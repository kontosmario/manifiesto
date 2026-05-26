import { afterEach, describe, expect, it, vi } from 'vitest'

// Controllable fakes for the two native modules getBiometricLoginState
// reads. We tweak these per-test to simulate transient read failures.
const laState = {
  hasHardware: true,
  isEnrolled: true,
  supportedTypes: [2] as number[], // 2 = FACIAL_RECOGNITION
  throwSupportedTypes: false,
}

vi.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: () => Promise.resolve(laState.hasHardware),
  isEnrolledAsync: () => Promise.resolve(laState.isEnrolled),
  supportedAuthenticationTypesAsync: () =>
    laState.throwSupportedTypes
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(laState.supportedTypes),
  authenticateAsync: () => Promise.resolve({ success: true }),
}))

const ssState = {
  available: true,
  metadata: null as string | null,
  throwGet: false,
}

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when_unlocked',
  isAvailableAsync: () => Promise.resolve(ssState.available),
  getItemAsync: (key: string) =>
    ssState.throwGet
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(key.includes('metadata') ? ssState.metadata : null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}))

const asState = { enabled: false }

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) =>
      Promise.resolve(key === 'auth.biometric.enabled' && asState.enabled ? '1' : null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}))

import { getBiometricLoginState } from '@/lib/biometric-auth'

afterEach(() => {
  laState.hasHardware = true
  laState.isEnrolled = true
  laState.supportedTypes = [2]
  laState.throwSupportedTypes = false
  ssState.available = true
  ssState.metadata = null
  ssState.throwGet = false
  asState.enabled = false
})

describe('getBiometricLoginState', () => {
  it('happy path: hardware + enrolled + metadata → disponible con credenciales', async () => {
    ssState.metadata = JSON.stringify({ email: 'user@test.com' })
    const state = await getBiometricLoginState()
    expect(state.hasSavedCredentials).toBe(true)
    expect(state.isAvailable).toBe(true)
    expect(state.label).toBe('Face ID')
  })

  it('REGRESIÓN: un read que falla NO colapsa las demás señales', async () => {
    // metadata presente, pero supportedTypes (el read del label) lanza.
    // Antes (Promise.all + catch) esto devolvía TODO en false y escondía
    // el CTA Face ID en la pantalla de bloqueo. Ahora solo degrada el label.
    ssState.metadata = JSON.stringify({ email: 'user@test.com' })
    laState.throwSupportedTypes = true

    const state = await getBiometricLoginState()

    expect(state.hasSavedCredentials).toBe(true) // ← sobrevive
    expect(state.isAvailable).toBe(true) // ← sobrevive
    expect(state.label).toBe('Face ID / Touch ID') // fallback de label
  })

  it('si el read de metadata falla, hasSavedCredentials cae a false pero isAvailable sobrevive', async () => {
    ssState.throwGet = true
    const state = await getBiometricLoginState()
    expect(state.hasSavedCredentials).toBe(false)
    expect(state.isAvailable).toBe(true)
  })

  it('sin enrolamiento → no disponible', async () => {
    ssState.metadata = JSON.stringify({ email: 'user@test.com' })
    laState.isEnrolled = false
    const state = await getBiometricLoginState()
    expect(state.isAvailable).toBe(false)
    expect(state.hasSavedCredentials).toBe(true)
  })

  it('REGRESIÓN: si el metadata read falla pero la flag está set, hasSavedCredentials sigue true (defense in depth)', async () => {
    ssState.throwGet = true   // metadata read rejects
    asState.enabled = true    // flag mirror says biometric is enabled
    const state = await getBiometricLoginState()
    expect(state.hasSavedCredentials).toBe(true) // ← clave: NO colapsa a false
    expect(state.isAvailable).toBe(true)         // hardware/enroll OK
  })
})
