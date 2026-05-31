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

import { clearPin, getPinLockState, setPin, verifyPinOk } from '@/lib/pin-lock'

beforeEach(() => {
  secure.clear()
  enabledStore.value = false
})

describe('pin-lock', () => {
  it('setPin stores a hash, never the plaintext', async () => {
    await setPin('1234')
    const stored = Array.from(secure.values()).join('|')
    expect(stored).not.toContain('1234')
  })

  it('verifyPin true for the correct pin, false otherwise', async () => {
    await setPin('1234')
    expect(await verifyPinOk('1234')).toBe(true)
    expect(await verifyPinOk('0000')).toBe(false)
  })

  it('verifyPin false when no pin is set', async () => {
    expect(await verifyPinOk('1234')).toBe(false)
  })

  it('clearPin removes the pin', async () => {
    await setPin('1234')
    await clearPin()
    expect(await verifyPinOk('1234')).toBe(false)
    expect((await getPinLockState()).isSet).toBe(false)
  })

  it('getPinLockState.isSet true after setPin', async () => {
    await setPin('1234')
    expect((await getPinLockState()).isSet).toBe(true)
  })

  it('getPinLockState.isSet true from the enabled flag even if keychain read returns null', async () => {
    enabledStore.value = true
    expect((await getPinLockState()).isSet).toBe(true)
  })

  it('setPin rejects non-4-digit input', async () => {
    await expect(setPin('12')).rejects.toThrow()
    await expect(setPin('abcd')).rejects.toThrow()
    await expect(setPin('12345')).rejects.toThrow()
  })

  it('two devices with the same pin get different hashes (salted)', async () => {
    await setPin('1234')
    const hashA = secure.get('app-lock.pin.hash')
    secure.clear()
    enabledStore.value = false
    await setPin('1234')
    const hashB = secure.get('app-lock.pin.hash')
    expect(hashA).toBeTruthy()
    expect(hashB).toBeTruthy()
    expect(hashA).not.toBe(hashB)
  })
})
