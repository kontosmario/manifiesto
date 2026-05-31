import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pin-lock module touches SecureStore (already stubbed via
// tests/stubs/expo-secure-store.ts) and pbkdf2 (pure JS, works under
// vitest). Salt generation uses globalThis.crypto.getRandomValues
// which Node provides natively. This test exercises the surface
// without async I/O at the boundary.

const secure = new Map<string, string>()
const enabledStore = { value: false }

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  setItemAsync: vi.fn(async (k: string, v: string) => { secure.set(k, v) }),
  getItemAsync: vi.fn(async (k: string) => secure.get(k) ?? null),
  deleteItemAsync: vi.fn(async (k: string) => { secure.delete(k) }),
}))
vi.mock('@/features/auth/pin-enabled-flag', () => ({
  setPinEnabledFlag: vi.fn(async () => { enabledStore.value = true }),
  clearPinEnabledFlag: vi.fn(async () => { enabledStore.value = false }),
  isPinEnabledFlagSet: vi.fn(async () => enabledStore.value),
}))

beforeEach(() => {
  secure.clear()
  enabledStore.value = false
})

describe('pin-lock hardening', () => {
  it('hashPin is deterministic for the same (salt, pin, iter)', async () => {
    // Imported lazily to avoid issues if hashing is heavy at import time.
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    const first = await verifyPin('1234')
    expect(first.ok).toBe(true)
    const second = await verifyPin('1234')
    expect(second.ok).toBe(true)
    await clearPin()
  })

  it('verifyPin rejects wrong pin and increments lockout after threshold', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    for (let i = 0; i < 5; i++) {
      const r = await verifyPin('0000')
      expect(r.ok).toBe(false)
    }
    // 6th attempt should be locked
    const locked = await verifyPin('0000')
    expect(locked.ok).toBe(false)
    expect(locked.lockedForMs).toBeGreaterThan(0)
    await clearPin()
  })

  it('successful verify clears lockout', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    await verifyPin('0000')
    await verifyPin('0000')
    const ok = await verifyPin('1234')
    expect(ok.ok).toBe(true)
    // Next attempt should not be locked
    const next = await verifyPin('1234')
    expect(next.ok).toBe(true)
    expect(next.lockedForMs).toBe(0)
    await clearPin()
  })
})
