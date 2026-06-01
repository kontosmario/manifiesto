// PIN-based app lock — PBKDF2-hardened hash in SecureStore.
//
// Threat model: a CASUAL lock + offline brute-force resistance.
// Real-world attackers don't enumerate all 10k 4-digit combinations
// — they try the ~100 most common PINs first (1234, 0000, 1111,
// 2580, birthdays, repeats). PBKDF2 with 100k iterations costs
// ~100ms/attempt on modern phones:
//   - top-100 PINs:  ~10s   to brute-force offline
//   - full 10k space: ~17min to brute-force offline
// Plus the in-app lockout (5 attempts → 30s/1m/2m/4m/8m exponential
// backoff) caps the ONLINE attack budget. The lockout state lives
// in SecureStore, so a user-controlled wipe (uninstall+reinstall,
// SecureStore.deleteItemAsync) resets the counter — that's the
// "casual lock" boundary, not full anti-forensics defense. A
// server-mirrored lockout is tracked as future work.
//
// PBKDF2 is implemented manually on top of `js-sha256`'s HMAC
// (RN/Hermes-compatible, zero transitive deps). The `pbkdf2` npm
// package pulls `readable-stream` → Node `events`, which Metro
// can't resolve — that broke the bundle the first time we shipped
// this hardening. js-sha256 was already a dep; building PBKDF2 on
// top costs ~20 lines and avoids the Node-stdlib dependency chain.

import * as SecureStore from 'expo-secure-store'
import { sha256 } from 'js-sha256'
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
const SHA256_BLOCK_BYTES = 32

// Lockout: 5 failed attempts triggers a backoff. Each subsequent
// failure doubles the wait (30s, 1min, 2min, 4min, 8min cap).
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_BASE_MS = 30_000
const LOCKOUT_MAX_MS = 8 * 60 * 1000

interface LockoutState {
  failedAttempts: number
  lockedUntilMs: number
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0')
  }
  return s
}

// PBKDF2-HMAC-SHA256 specialized for 32-byte output (one block,
// since SHA-256 produces 32-byte digests). This is enough for our
// stored hash; we don't need the multi-block branch of the full
// PBKDF2 spec.
//
//   T1 = U1 ^ U2 ^ ... ^ Uc
//   U1 = HMAC(pwd, salt || INT32_BE(1))
//   Uj = HMAC(pwd, U_{j-1})  for j = 2..c
//
// js-sha256's `sha256.hmac.array(key, msg)` returns a number[] of
// length 32; we treat it as bytes and XOR-accumulate.
function pbkdf2HmacSha256(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  const saltWithIndex = new Uint8Array(salt.length + 4)
  saltWithIndex.set(salt)
  // INT32 big-endian 1: [0, 0, 0, 1]. We only need block index 1
  // because the requested output (32 bytes) ≤ HMAC-SHA256 output.
  saltWithIndex[salt.length + 3] = 1

  let u = sha256.hmac.array(password, Array.from(saltWithIndex))
  const result = new Uint8Array(SHA256_BLOCK_BYTES)
  for (let i = 0; i < SHA256_BLOCK_BYTES; i++) result[i] = u[i]

  for (let j = 2; j <= iterations; j++) {
    u = sha256.hmac.array(password, u)
    for (let i = 0; i < SHA256_BLOCK_BYTES; i++) result[i] ^= u[i]
  }

  return result
}

// CSPRNG salt via Web Crypto. Hermes (RN >= 0.74) ships
// `crypto.getRandomValues` as a JS builtin — no native module
// needed. We THROW rather than silently fall back to Math.random
// because a predictable salt collapses PBKDF2 to a rainbow-table
// lookup. The throw surfaces immediately at setPin time (visible
// in dev / crash reports) instead of degrading the security of a
// real user's PIN. Pinned RN >= 0.81.x in package.json so this
// throw should never fire in practice.
function randomSalt(): string {
  const bytes = new Uint8Array(16)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (!webCrypto?.getRandomValues) {
    throw new Error(
      '[pin-lock] crypto.getRandomValues unavailable — refusing to set a PIN with a non-CSPRNG salt. ' +
        'This indicates a runtime regression (Hermes >= 0.74 ships getRandomValues natively).',
    )
  }
  webCrypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function hashPin(salt: string, pin: string, iterations: number): string {
  const dk = pbkdf2HmacSha256(pin, hexToBytes(salt), iterations)
  return bytesToHex(dk)
}

// PBKDF2 blocks the JS thread ~100ms on modern devices. Yielding
// one macrotask before the call lets React commit a pending render
// (e.g. the PinPad "checking…" loading state) so the user sees
// feedback instead of staring at a frozen UI. Cheap; one tick.
async function hashPinAsync(salt: string, pin: string, iterations: number): Promise<string> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  return hashPin(salt, pin, iterations)
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
  await SecureStore.setItemAsync(PIN_HASH_KEY, await hashPinAsync(salt, pin, PBKDF2_ITERATIONS), storeOptions)
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
    const computed = await hashPinAsync(salt, pin, Number.isFinite(iter) && iter > 0 ? iter : PBKDF2_ITERATIONS)
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
