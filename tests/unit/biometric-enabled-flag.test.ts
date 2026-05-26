import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock AsyncStorage with a simple in-memory backing.
const store = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    },
    removeItem: (key: string) => {
      store.delete(key)
      return Promise.resolve()
    },
  },
}))

import {
  clearBiometricEnabledFlag,
  isBiometricEnabledFlagSet,
  setBiometricEnabledFlag,
} from '@/features/auth/biometric-enabled-flag'

beforeEach(() => {
  store.clear()
})

afterEach(() => {
  store.clear()
})

describe('biometric-enabled-flag', () => {
  it('lee false cuando nunca se setteó', async () => {
    expect(await isBiometricEnabledFlagSet()).toBe(false)
  })

  it('lee true tras setBiometricEnabledFlag()', async () => {
    await setBiometricEnabledFlag()
    expect(await isBiometricEnabledFlagSet()).toBe(true)
  })

  it('vuelve a false tras clearBiometricEnabledFlag()', async () => {
    await setBiometricEnabledFlag()
    await clearBiometricEnabledFlag()
    expect(await isBiometricEnabledFlagSet()).toBe(false)
  })

  it('clearBiometricEnabledFlag es idempotente si la flag no existía', async () => {
    await expect(clearBiometricEnabledFlag()).resolves.not.toThrow()
    expect(await isBiometricEnabledFlagSet()).toBe(false)
  })

  it('isBiometricEnabledFlagSet devuelve false si AsyncStorage devuelve un valor inesperado', async () => {
    // simular un valor escrito por una versión anterior con string distinto
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem('auth.biometric.enabled', 'no')
    expect(await isBiometricEnabledFlagSet()).toBe(false)
  })
})
