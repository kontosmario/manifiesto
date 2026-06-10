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

// Sprint G · G-Auth3: pin-lock now imports the Supabase client to mirror
// failures server-side. Stub the client so tests don't try to load the
// native @supabase/supabase-js bundle (which transitively pulls RN deps).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
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
    await setPin('7392')
    const first = await verifyPin('7392')
    expect(first.ok).toBe(true)
    const second = await verifyPin('7392')
    expect(second.ok).toBe(true)
    await clearPin()
  }, 60_000)

  it('verifyPin rejects wrong pin and increments lockout after threshold', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('7392')
    for (let i = 0; i < 5; i++) {
      const r = await verifyPin('5174')
      expect(r.ok).toBe(false)
    }
    // 6th attempt should be locked
    const locked = await verifyPin('5174')
    expect(locked.ok).toBe(false)
    expect(locked.lockedForMs).toBeGreaterThan(0)
    await clearPin()
  }, 120_000)

  it('successful verify clears lockout', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('7392')
    await verifyPin('5174')
    await verifyPin('5174')
    const ok = await verifyPin('7392')
    expect(ok.ok).toBe(true)
    // Next attempt should not be locked
    const next = await verifyPin('7392')
    expect(next.ok).toBe(true)
    expect(next.lockedForMs).toBe(0)
    await clearPin()
  }, 60_000)
})
