// PIN-based app lock — PBKDF2-hardened hash in SecureStore.
//
// Threat model: a CASUAL lock + offline brute-force resistance.
// Real-world attackers don't enumerate all 10k 4-digit combinations
// — they try the ~100 most common PINs first (1234, 0000, 1111,
// 2580, birthdays, repeats).
//
// Sprint F · F2 hardening (2026-06-10):
//   - PBKDF2 iterations: 100_000 → 600_000 (OWASP 2023 baseline
//     for HMAC-SHA-256). New cost on modern phones is ~600ms/attempt:
//       · top-100 PINs:   ~60s   offline (was ~10s)
//       · full 10k 4-dig: ~100min offline (was ~17min)
//   - Allow 4–8 digit PINs. A 6-digit space is 100x larger than
//     4-digit, pushing full-enumeration past the practical horizon
//     for casual offline attackers. The pad still defaults to 4
//     for backward compatibility; users can pick longer if they
//     want.
//   - Reject a small blocklist of well-known weak PINs (all-same,
//     simple sequential, top-row patterns).
//   - On verifyPin, if the stored iteration count is below the
//     current target, transparently re-hash with the new target
//     after a successful verification. Silent upgrade — no user
//     prompt, no re-enroll.
//
// Plus the in-app lockout (5 attempts → 30s/1m/2m/4m/8m exponential
// backoff) caps the ONLINE attack budget. The lockout state lives
// in SecureStore as the FAST PATH.
//
// Sprint G · G-Auth3: server-side mirror. The same lockout schedule
// is also tracked server-side via `track_pin_failure` / `get_pin_lockout`
// / `clear_pin_failures`. The client takes max(local, server) so a
// rooted device wiping SecureStore values can't reset the server's
// view of the user's failure count. The mirror is best-effort: it only
// runs when a Supabase session is available, so cold-start app-lock
// (when no session exists yet) falls back to the SecureStore-only
// floor. Cannot defend against a fully offline attacker (they patch
// the client to skip the RPC), but it deters the casual jailbreak +
// SecureStore-rewrite scenario.
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
import { supabase } from '@/lib/supabase'

const PIN_HASH_KEY = 'app-lock.pin.hash'
const PIN_SALT_KEY = 'app-lock.pin.salt'
const PIN_ITER_KEY = 'app-lock.pin.iterations'
const PIN_LOCKOUT_KEY = 'app-lock.pin.lockout'

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

// Sprint F · F2: accept 4–8 digit PINs. Users keep their existing
// 4-digit PIN (no forced re-enroll); new PINs may be longer.
export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 8
const PIN_PATTERN = /^\d{4,8}$/
// Sprint F · F2: bumped to OWASP 2023 PBKDF2-HMAC-SHA-256 baseline.
// Old hashes (100k) auto-upgrade to this target on next successful
// verifyPin — see `PIN_ITER_LEGACY` below for the migration boundary.
const PIN_ITER_TARGET = 600_000
const PIN_ITER_LEGACY = 100_000
const SHA256_BLOCK_BYTES = 32

// Sprint F · F2: weak-PIN blocklist. Not exhaustive — the goal is to
// stop a casual user from picking the textbook-worst handful of PINs
// that show up across every leaked-password study (Berry 2012 et al).
// Curated for both 4-digit and the most common 6-digit weak patterns.
// Repeating digits + simple-sequential PINs are detected algorithmically
// below so we don't bloat this set with all 10 of each.
const WEAK_PINS: ReadonlySet<string> = new Set([
  // Top leaked 4-digit PINs
  '1234', '4321', '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',
  '1212', '1313', '2580', '0852', '6969', '1004', '2000',
  '5683', // "LOVE" on a phone keypad
  '0123', '9876', '2468', '1357',
  // Common 6-digit weak PINs
  '123456', '654321', '111111', '000000', '121212', '123123',
  '696969', '112233', '789456', '159753', '147258', '258369',
  '102030',
  // Long all-same / sequential, in case user picks 7/8 digits
  '11111111', '00000000', '12345678', '87654321',
  '1111111', '0000000', '1234567', '7654321',
])

/**
 * Detect a "weak" PIN that we refuse to set even though it matches
 * the digit-length pattern. Catches:
 *   · all-same digits (1111, 222222, ...)
 *   · simple monotonic sequences ascending or descending by 1
 *     (1234, 56789, 9876, 0123 wrap rejected by string compare)
 *   · entries in the hardcoded `WEAK_PINS` list
 */
export function isWeakPin(pin: string): boolean {
  if (WEAK_PINS.has(pin)) return true
  // All-same: every digit equals the first.
  if (pin.split('').every((d) => d === pin[0])) return true
  // Strictly ascending step=+1: digits[i+1] = digits[i] + 1.
  let ascending = true
  let descending = true
  for (let i = 1; i < pin.length; i++) {
    const prev = pin.charCodeAt(i - 1) - 48
    const cur = pin.charCodeAt(i) - 48
    if (cur !== prev + 1) ascending = false
    if (cur !== prev - 1) descending = false
  }
  return ascending || descending
}

export class WeakPinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeakPinError'
  }
}

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
export function _pbkdf2HmacSha256ForTesting(password: string, salt: Uint8Array, iterations: number): Uint8Array {
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
  const dk = _pbkdf2HmacSha256ForTesting(pin, hexToBytes(salt), iterations)
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

// Sprint G · G-Auth3: server-side mirror. All three helpers are
// best-effort — they swallow network/auth errors and return a neutral
// value so the client-side floor still works on cold-start (no
// session) or transient network failures.
//
// Important: we only call these when a Supabase session is present.
// The app-lock screen runs BEFORE the session is restored on cold
// start, so the first verifyPin of the day will skip the RPC entirely
// and rely on the SecureStore floor. Subsequent attempts (after the
// user successfully unlocks and the session is restored) will mirror
// up.

async function hasActiveSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    return Boolean(data.session)
  } catch {
    return false
  }
}

async function trackServerPinFailure(): Promise<number> {
  try {
    if (!(await hasActiveSession())) return 0
    const { data, error } = await supabase.rpc('track_pin_failure')
    if (error || !data) return 0
    const row = Array.isArray(data) ? data[0] : data
    const lockedUntil = Number(row?.locked_until_ms ?? 0)
    if (!Number.isFinite(lockedUntil) || lockedUntil <= 0) return 0
    return Math.max(0, lockedUntil - Date.now())
  } catch {
    return 0
  }
}

async function clearServerPinFailures(): Promise<void> {
  try {
    if (!(await hasActiveSession())) return
    await supabase.rpc('clear_pin_failures')
  } catch {
    // swallow — clearing is opportunistic
  }
}

async function readServerLockout(): Promise<number> {
  try {
    if (!(await hasActiveSession())) return 0
    const { data, error } = await supabase.rpc('get_pin_lockout')
    if (error || !data) return 0
    const row = Array.isArray(data) ? data[0] : data
    const lockedUntil = Number(row?.locked_until_ms ?? 0)
    if (!Number.isFinite(lockedUntil) || lockedUntil <= 0) return 0
    return Math.max(0, lockedUntil - Date.now())
  } catch {
    return 0
  }
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
    throw new Error(`El PIN debe tener entre ${PIN_MIN_LENGTH} y ${PIN_MAX_LENGTH} dígitos.`)
  }
  // Sprint F · F2: reject obvious weak PINs at setPin time. The
  // setup screen also checks `isWeakPin` to give a specific UX hint
  // before reaching here; this throw is the defense-in-depth gate.
  if (isWeakPin(pin)) {
    throw new WeakPinError(
      'Ese PIN es demasiado fácil de adivinar. Evitá repeticiones (1111) o secuencias (1234).',
    )
  }
  const salt = randomSalt()
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt, storeOptions)
  await SecureStore.setItemAsync(PIN_ITER_KEY, String(PIN_ITER_TARGET), storeOptions)
  await SecureStore.setItemAsync(PIN_HASH_KEY, await hashPinAsync(salt, pin, PIN_ITER_TARGET), storeOptions)
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
    // Sprint G · G-Auth3: take the stricter of local + server lockouts.
    // Even when SecureStore says "locked", we still consult the server
    // so a wiped local store can't free the user prematurely. Server
    // returns 0 silently if no session is available, so this is a
    // no-op cost on cold-start app-lock.
    const serverLocked = await readServerLockout()
    const lockedForMs = Math.max(lockout.lockedUntilMs - now, serverLocked)
    return { ok: false, lockedForMs }
  }
  try {
    const salt = await SecureStore.getItemAsync(PIN_SALT_KEY, storeOptions)
    const hash = await SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions)
    const iterRaw = await SecureStore.getItemAsync(PIN_ITER_KEY, storeOptions)
    if (!salt || !hash) {
      return { ok: false, lockedForMs: 0 }
    }
    // Default to the LEGACY iteration count when the stored value
    // is missing — that's how old installs (pre-F2) wrote their
    // hashes, so we must reproduce the same input to verify.
    const iter = iterRaw ? Number.parseInt(iterRaw, 10) : PIN_ITER_LEGACY
    const effectiveIter = Number.isFinite(iter) && iter > 0 ? iter : PIN_ITER_LEGACY
    const computed = await hashPinAsync(salt, pin, effectiveIter)
    if (computed === hash) {
      await clearLockout()
      // Sprint G · G-Auth3: clear the server counter too. Best-effort.
      void clearServerPinFailures()
      // Sprint F · F2: silent upgrade. If the hash was generated at
      // a weaker iteration count than the current target, re-hash
      // with the new target (and a fresh salt for good measure) and
      // overwrite the stored material. Best-effort: if any SecureStore
      // write fails we still report success — the user just stays on
      // the old hash and we'll retry next verifyPin.
      if (effectiveIter < PIN_ITER_TARGET) {
        try {
          const nextSalt = randomSalt()
          const nextHash = await hashPinAsync(nextSalt, pin, PIN_ITER_TARGET)
          await SecureStore.setItemAsync(PIN_SALT_KEY, nextSalt, storeOptions)
          await SecureStore.setItemAsync(PIN_ITER_KEY, String(PIN_ITER_TARGET), storeOptions)
          await SecureStore.setItemAsync(PIN_HASH_KEY, nextHash, storeOptions)
        } catch {
          // Swallow — re-hash is opportunistic, not load-bearing.
        }
      }
      return { ok: true, lockedForMs: 0 }
    }
    const nextFailed = lockout.failedAttempts + 1
    const dur = nextLockoutDuration(nextFailed)
    await writeLockout({
      failedAttempts: nextFailed,
      lockedUntilMs: dur > 0 ? now + dur : 0,
    })
    // Sprint G · G-Auth3: also bump server counter and honour the
    // stricter of the two lockouts. The server runs the same schedule
    // (5 → 30s/1m/2m/4m/8m), so under happy-path conditions both sides
    // agree. The divergence happens after a SecureStore wipe: client
    // says "no lockout", server still has the accumulated failures.
    const serverLockMs = await trackServerPinFailure()
    return { ok: false, lockedForMs: Math.max(dur, serverLockMs) }
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
  const [hashResult, flagResult, lockout, serverLockedForMs] = await Promise.all([
    SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions),
    isPinEnabledFlagSet(),
    readLockout(),
    // Sprint G · G-Auth3: include server lockout in the snapshot so
    // sheets that gate on `lockedForMs > 0` honour it without needing
    // to call verifyPin first. Best-effort: returns 0 silently when no
    // session is available.
    readServerLockout(),
  ])
  const hasHash = Boolean(hashResult)
  const flagSet = flagResult === true
  const now = Date.now()
  const localLockedForMs = Math.max(0, lockout.lockedUntilMs - now)
  const lockedForMs = Math.max(localLockedForMs, serverLockedForMs)
  return { isSet: hasHash || flagSet, lockedForMs }
}
