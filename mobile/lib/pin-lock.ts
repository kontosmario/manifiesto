// PIN-based app lock — PBKDF2-hardened hash in SecureStore.
//
// Threat model: a CASUAL lock + offline brute-force resistance. A
// 4-digit PIN has 10k combinations; with naive SHA-256 + Keychain
// dump an attacker brute-forces in milliseconds. PBKDF2 with 100k
// iterations makes it cost ~100ms/attempt on modern phones — 10k
// PINs × 100ms = ~17 min, plus the OS-level lockout below caps the
// online attack window separately.
//
// Pure-JS is intentional: adding a native crypto module
// (expo-crypto / expo-standard-web-crypto) requires a dev-client
// rebuild — `expo-standard-web-crypto` already crashed the app once
// on a missing `ExpoCryptoAES` native module. The `pbkdf2` npm
// package is pure JS and ships on Hermes with no rebuild.

import * as SecureStore from 'expo-secure-store'
import { pbkdf2Sync } from 'pbkdf2'
import { Buffer } from 'buffer'
import {
  clearPinEnabledFlag,
  isPinEnabledFlagSet,
  setPinEnabledFlag,
} from '@/features/auth/pin-enabled-flag'

const PIN_HASH_KEY = 'app-lock.pin.hash'
const PIN_SALT_KEY = 'app-lock.pin.salt'
const PIN_ITER_KEY = 'app-lock.pin.iterations'
const PIN_LOCKOUT_KEY = 'app-lock.pin.lockout'

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const PIN_PATTERN = /^\d{4}$/
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = 'sha256'

// Lockout: 5 failed attempts triggers a backoff. Each subsequent
// failure doubles the wait (30s, 1min, 2min, 4min, 8min cap).
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_BASE_MS = 30_000
const LOCKOUT_MAX_MS = 8 * 60 * 1000

interface LockoutState {
  failedAttempts: number
  lockedUntilMs: number
}

// CSPRNG salt via Web Crypto. Hermes (RN >= 0.74) ships
// `crypto.getRandomValues` as a JS builtin — no native module
// needed. If it ever vanishes we fall back to a non-crypto source
// with a noisy console.warn so the regression is detectable.
function randomSalt(): string {
  const bytes = new Uint8Array(16)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    console.warn('[pin-lock] crypto.getRandomValues unavailable; salt is NOT cryptographically random')
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Buffer.from(bytes).toString('hex')
}

function hashPin(salt: string, pin: string, iterations: number): string {
  return pbkdf2Sync(Buffer.from(pin, 'utf8'), Buffer.from(salt, 'hex'), iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex')
}

async function readLockout(): Promise<LockoutState> {
  try {
    const raw = await SecureStore.getItemAsync(PIN_LOCKOUT_KEY, storeOptions)
    if (!raw) return { failedAttempts: 0, lockedUntilMs: 0 }
    const parsed = JSON.parse(raw) as LockoutState
    return {
      failedAttempts: Number.isFinite(parsed.failedAttempts) ? parsed.failedAttempts : 0,
      lockedUntilMs: Number.isFinite(parsed.lockedUntilMs) ? parsed.lockedUntilMs : 0,
    }
  } catch {
    return { failedAttempts: 0, lockedUntilMs: 0 }
  }
}

async function writeLockout(state: LockoutState): Promise<void> {
  await SecureStore.setItemAsync(PIN_LOCKOUT_KEY, JSON.stringify(state), storeOptions)
}

async function clearLockout(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY)
}

function nextLockoutDuration(failedAttempts: number): number {
  // failed=5 → 30s, failed=6 → 60s, failed=7 → 120s, ... cap 8min
  const overage = failedAttempts - LOCKOUT_THRESHOLD
  if (overage < 0) return 0
  const dur = LOCKOUT_BASE_MS * Math.pow(2, overage)
  return Math.min(dur, LOCKOUT_MAX_MS)
}

export async function setPin(pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('El PIN debe tener exactamente 4 dígitos.')
  }
  const salt = randomSalt()
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt, storeOptions)
  await SecureStore.setItemAsync(PIN_ITER_KEY, String(PBKDF2_ITERATIONS), storeOptions)
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(salt, pin, PBKDF2_ITERATIONS), storeOptions)
  await clearLockout()
  await setPinEnabledFlag()
}

export interface VerifyPinResult {
  ok: boolean
  /** When ok=false, ms until next allowed attempt (0 if not locked). */
  lockedForMs: number
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  const lockout = await readLockout()
  const now = Date.now()
  if (lockout.lockedUntilMs > now) {
    return { ok: false, lockedForMs: lockout.lockedUntilMs - now }
  }
  try {
    const salt = await SecureStore.getItemAsync(PIN_SALT_KEY, storeOptions)
    const hash = await SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions)
    const iterRaw = await SecureStore.getItemAsync(PIN_ITER_KEY, storeOptions)
    if (!salt || !hash) {
      return { ok: false, lockedForMs: 0 }
    }
    const iter = iterRaw ? Number.parseInt(iterRaw, 10) : PBKDF2_ITERATIONS
    const computed = hashPin(salt, pin, Number.isFinite(iter) && iter > 0 ? iter : PBKDF2_ITERATIONS)
    if (computed === hash) {
      await clearLockout()
      return { ok: true, lockedForMs: 0 }
    }
    const nextFailed = lockout.failedAttempts + 1
    const dur = nextLockoutDuration(nextFailed)
    await writeLockout({
      failedAttempts: nextFailed,
      lockedUntilMs: dur > 0 ? now + dur : 0,
    })
    return { ok: false, lockedForMs: dur }
  } catch {
    return { ok: false, lockedForMs: 0 }
  }
}

export async function verifyPinOk(pin: string): Promise<boolean> {
  const result = await verifyPin(pin)
  return result.ok
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY)
  await SecureStore.deleteItemAsync(PIN_SALT_KEY)
  await SecureStore.deleteItemAsync(PIN_ITER_KEY)
  await clearLockout()
  await clearPinEnabledFlag()
}

export async function getPinLockState(): Promise<{ isSet: boolean; lockedForMs: number }> {
  const [hashResult, flagResult, lockout] = await Promise.all([
    SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions),
    isPinEnabledFlagSet(),
    readLockout(),
  ])
  const hasHash = Boolean(hashResult)
  const flagSet = flagResult === true
  const now = Date.now()
  const lockedForMs = Math.max(0, lockout.lockedUntilMs - now)
  return { isSet: hasHash || flagSet, lockedForMs }
}
