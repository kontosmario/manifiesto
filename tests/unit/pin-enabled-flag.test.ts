import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    removeItem: vi.fn(async (k: string) => { store.delete(k) }),
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
  },
}))

import {
  clearPinEnabledFlag,
  isPinEnabledFlagSet,
  setPinEnabledFlag,
} from '@/features/auth/pin-enabled-flag'

beforeEach(() => store.clear())

describe('pin-enabled-flag', () => {
  it('returns false when unset', async () => {
    expect(await isPinEnabledFlagSet()).toBe(false)
  })
  it('true after set', async () => {
    await setPinEnabledFlag()
    expect(await isPinEnabledFlagSet()).toBe(true)
  })
  it('false after clear', async () => {
    await setPinEnabledFlag()
    await clearPinEnabledFlag()
    expect(await isPinEnabledFlagSet()).toBe(false)
  })
})
