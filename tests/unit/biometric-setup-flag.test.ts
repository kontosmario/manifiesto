import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  clearBiometricSetupShown,
  getBiometricSetupShown,
  markBiometricSetupShown,
} from '@/features/auth/biometric-setup-flag'

beforeEach(() => {
  store.clear()
})

describe('biometric-setup-flag', () => {
  it('returns false when no flag is stored for the user', async () => {
    expect(await getBiometricSetupShown('user-1')).toBe(false)
  })

  it('returns true after mark', async () => {
    await markBiometricSetupShown('user-1')
    expect(await getBiometricSetupShown('user-1')).toBe(true)
  })

  it('returns false after clear', async () => {
    await markBiometricSetupShown('user-1')
    await clearBiometricSetupShown('user-1')
    expect(await getBiometricSetupShown('user-1')).toBe(false)
  })

  it('isolates flags between users', async () => {
    await markBiometricSetupShown('user-A')
    expect(await getBiometricSetupShown('user-A')).toBe(true)
    expect(await getBiometricSetupShown('user-B')).toBe(false)
  })

  it('returns false when userId is empty', async () => {
    expect(await getBiometricSetupShown('')).toBe(false)
  })

  it('no-ops when marking with empty userId', async () => {
    await markBiometricSetupShown('')
    expect(store.size).toBe(0)
  })
})
