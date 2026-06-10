import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// Sprint G · G-Auth3: pin-lock now consults Supabase for the server
// failure mirror. Stub the client to return "no session" so the server
// path becomes a no-op and existing tests keep covering the SecureStore
// floor unchanged.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))

import {
  clearPin,
  getPinLockState,
  isWeakPin,
  setPin,
  verifyPin,
  verifyPinOk,
  WeakPinError,
} from '@/lib/pin-lock'

beforeEach(() => {
  secure.clear()
  enabledStore.value = false
})

// Sprint F · F2: 1234/0000 ahora son rechazados por el weak-PIN gate.
// Usamos un PIN sin patrón obvio para los tests del happy path.
const STRONG_PIN = '7392'
const ANOTHER_STRONG_PIN = '5174'

// Sprint F · F2: PBKDF2 at 600k iterations costs ~5s/hash in Node test
// runtime (much faster on a real device with native crypto). Bump per-
// test timeouts on the tests that hit verify/set so they don't time out
// at vitest's 5s default.
const HASH_TIMEOUT_MS = 30_000

describe('pin-lock', () => {
  it('setPin stores a hash, never the plaintext', async () => {
    await setPin(STRONG_PIN)
    const stored = Array.from(secure.values()).join('|')
    expect(stored).not.toContain(STRONG_PIN)
  }, HASH_TIMEOUT_MS)

  it('verifyPin true for the correct pin, false otherwise', async () => {
    await setPin(STRONG_PIN)
    expect(await verifyPinOk(STRONG_PIN)).toBe(true)
    expect(await verifyPinOk(ANOTHER_STRONG_PIN)).toBe(false)
  }, HASH_TIMEOUT_MS)

  it('verifyPin false when no pin is set', async () => {
    expect(await verifyPinOk(STRONG_PIN)).toBe(false)
  }, HASH_TIMEOUT_MS)

  it('clearPin removes the pin', async () => {
    await setPin(STRONG_PIN)
    await clearPin()
    expect(await verifyPinOk(STRONG_PIN)).toBe(false)
    expect((await getPinLockState()).isSet).toBe(false)
  }, HASH_TIMEOUT_MS)

  it('getPinLockState.isSet true after setPin', async () => {
    await setPin(STRONG_PIN)
    expect((await getPinLockState()).isSet).toBe(true)
  }, HASH_TIMEOUT_MS)

  it('getPinLockState.isSet true from the enabled flag even if keychain read returns null', async () => {
    enabledStore.value = true
    expect((await getPinLockState()).isSet).toBe(true)
  })

  it('setPin rejects input shorter than 4 / longer than 8 / non-digit', async () => {
    await expect(setPin('12')).rejects.toThrow()
    await expect(setPin('abcd')).rejects.toThrow()
    await expect(setPin('123456789')).rejects.toThrow()
  })

  it('two devices with the same pin get different hashes (salted)', async () => {
    await setPin(STRONG_PIN)
    const hashA = secure.get('app-lock.pin.hash')
    secure.clear()
    enabledStore.value = false
    await setPin(STRONG_PIN)
    const hashB = secure.get('app-lock.pin.hash')
    expect(hashA).toBeTruthy()
    expect(hashB).toBeTruthy()
    expect(hashA).not.toBe(hashB)
  }, HASH_TIMEOUT_MS)

  // Sprint F · F2 — new behaviour ─────────────────────────────────────

  it('F2: setPin accepts 6-digit PINs (4–8 digit range)', async () => {
    await setPin('739204')
    expect(await verifyPinOk('739204')).toBe(true)
    expect(await verifyPinOk('739205')).toBe(false)
  }, HASH_TIMEOUT_MS)

  it('F2: setPin accepts 8-digit PINs at the upper bound', async () => {
    await setPin('73920514')
    expect(await verifyPinOk('73920514')).toBe(true)
  }, HASH_TIMEOUT_MS)

  it('F2: setPin rejects all-same-digit PINs (1111, 222222, ...)', async () => {
    await expect(setPin('1111')).rejects.toThrowError(WeakPinError)
    await expect(setPin('0000')).rejects.toThrowError(WeakPinError)
    await expect(setPin('222222')).rejects.toThrowError(WeakPinError)
    await expect(setPin('88888888')).rejects.toThrowError(WeakPinError)
  })

  it('F2: setPin rejects simple ascending/descending sequences', async () => {
    await expect(setPin('1234')).rejects.toThrowError(WeakPinError)
    await expect(setPin('4321')).rejects.toThrowError(WeakPinError)
    await expect(setPin('123456')).rejects.toThrowError(WeakPinError)
    await expect(setPin('9876')).rejects.toThrowError(WeakPinError)
  })

  it('F2: setPin rejects hardcoded blocklist entries (2580, 0852, 5683...)', async () => {
    await expect(setPin('2580')).rejects.toThrowError(WeakPinError)
    await expect(setPin('0852')).rejects.toThrowError(WeakPinError)
    await expect(setPin('5683')).rejects.toThrowError(WeakPinError)
    await expect(setPin('6969')).rejects.toThrowError(WeakPinError)
  })

  it('F2: isWeakPin pure predicate matches the same set', () => {
    expect(isWeakPin('1111')).toBe(true)
    expect(isWeakPin('1234')).toBe(true)
    expect(isWeakPin('2580')).toBe(true)
    expect(isWeakPin(STRONG_PIN)).toBe(false)
    expect(isWeakPin('739204')).toBe(false)
  })

  it('F2: legacy hash (100k iterations) verifies AND gets silently re-hashed to target', async () => {
    // Simulate an install that stored its hash at the old 100k count.
    // We can't import internal helpers, so we replicate by writing the
    // legacy iter count to the store under an existing PIN. To do that
    // we set the PIN normally, then overwrite PIN_ITER_KEY to "100000"
    // and replace the hash accordingly using a one-shot pbkdf2 via
    // setPin (which stamps the target iter) — then mutate iter back to
    // legacy. The verify path will detect iter<target after a hit and
    // re-stamp.
    await setPin(STRONG_PIN)
    // Verify happy path is fine.
    expect(await verifyPinOk(STRONG_PIN)).toBe(true)

    // Reset stored iter to legacy 100k WITHOUT changing the hash. This
    // mimics an install that came in pre-F2. We compute a fresh hash at
    // 100k by importing the internal helper from the module.
    const { _pbkdf2HmacSha256ForTesting } = await import('@/lib/pin-lock')
    const salt = secure.get('app-lock.pin.salt')!
    const saltBytes = new Uint8Array(salt.length / 2)
    for (let i = 0; i < saltBytes.length; i++) {
      saltBytes[i] = Number.parseInt(salt.slice(i * 2, i * 2 + 2), 16)
    }
    const dk = _pbkdf2HmacSha256ForTesting(STRONG_PIN, saltBytes, 100_000)
    let hex = ''
    for (let i = 0; i < dk.length; i++) hex += dk[i].toString(16).padStart(2, '0')
    secure.set('app-lock.pin.hash', hex)
    secure.set('app-lock.pin.iterations', '100000')

    // Verify at the legacy count — should succeed AND trigger silent
    // upgrade to PIN_ITER_TARGET (600k).
    const result = await verifyPin(STRONG_PIN)
    expect(result.ok).toBe(true)

    // After the silent re-hash, the stored iter must be the new target.
    expect(secure.get('app-lock.pin.iterations')).toBe('600000')

    // And the new hash must verify under the new iter.
    expect(await verifyPinOk(STRONG_PIN)).toBe(true)
  }, 60_000)
})
