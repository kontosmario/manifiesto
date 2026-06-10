import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Sprint G · G-Auth3 — server-side PIN failure mirror.
//
// Verifies that:
//   1. On a failed verifyPin with an active Supabase session, the
//      client calls `track_pin_failure` and honours the server's
//      `locked_until_ms` if it's stricter than the local lockout.
//   2. On a successful verifyPin, `clear_pin_failures` is dispatched.
//   3. When no session is available (cold-start app-lock), the RPC is
//      NEVER called and only the local lockout state applies — i.e.
//      the new server path never blocks the fast path.

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

const sessionState = { active: true }
const rpcCalls: Array<{ name: string; args?: unknown }> = []
let serverLockedUntilMs = 0
let serverFailedAttempts = 0

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: sessionState.active ? { user: { id: 'u1' } } : null },
      })),
    },
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args })
      if (name === 'track_pin_failure') {
        serverFailedAttempts += 1
        return {
          data: [
            { failed_attempts: serverFailedAttempts, locked_until_ms: serverLockedUntilMs },
          ],
          error: null,
        }
      }
      if (name === 'get_pin_lockout') {
        return {
          data: [
            { failed_attempts: serverFailedAttempts, locked_until_ms: serverLockedUntilMs },
          ],
          error: null,
        }
      }
      if (name === 'clear_pin_failures') {
        serverFailedAttempts = 0
        serverLockedUntilMs = 0
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }),
  },
}))

const STRONG_PIN = '7392'

beforeEach(() => {
  secure.clear()
  enabledStore.value = false
  sessionState.active = true
  serverLockedUntilMs = 0
  serverFailedAttempts = 0
  rpcCalls.length = 0
})

afterEach(() => {
  // Allow any opportunistic, fire-and-forget `clear_pin_failures()`
  // promises (kicked off via `void` after a successful verify) to settle
  // before the next test's `beforeEach` resets state. Otherwise the
  // resolved RPC may clobber the next test's `rpcCalls` baseline.
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
})

describe('pin-lock — Sprint G · G-Auth3 server mirror', () => {
  it('failed verifyPin with an active session calls track_pin_failure', async () => {
    const { setPin, verifyPin } = await import('@/lib/pin-lock')
    await setPin(STRONG_PIN)
    rpcCalls.length = 0 // clear setPin RPC noise (there is none, but be safe)
    const result = await verifyPin('0009') // wrong PIN
    expect(result.ok).toBe(false)
    expect(rpcCalls.some((c) => c.name === 'track_pin_failure')).toBe(true)
  }, 120_000)

  it('successful verifyPin clears server-side counter', async () => {
    const { setPin, verifyPin } = await import('@/lib/pin-lock')
    await setPin(STRONG_PIN)
    rpcCalls.length = 0
    const result = await verifyPin(STRONG_PIN)
    expect(result.ok).toBe(true)
    // Allow microtask queue to drain (clear_pin_failures is `void`-fired).
    await new Promise((r) => setTimeout(r, 0))
    expect(rpcCalls.some((c) => c.name === 'clear_pin_failures')).toBe(true)
  }, 120_000)

  it('honours server lockout even when local lockout is shorter', async () => {
    const { setPin, verifyPin } = await import('@/lib/pin-lock')
    await setPin(STRONG_PIN)
    // Pretend the server has already accumulated failures and set a
    // lockout far in the future (60 seconds).
    serverFailedAttempts = 10
    serverLockedUntilMs = Date.now() + 60_000
    rpcCalls.length = 0
    const result = await verifyPin('0009') // wrong PIN
    expect(result.ok).toBe(false)
    expect(result.lockedForMs).toBeGreaterThanOrEqual(30_000)
  }, 120_000)

  it('skips the server RPC entirely when no Supabase session is available', async () => {
    const { setPin, verifyPin } = await import('@/lib/pin-lock')
    await setPin(STRONG_PIN)
    sessionState.active = false
    rpcCalls.length = 0
    const result = await verifyPin('0009') // wrong PIN
    expect(result.ok).toBe(false)
    expect(rpcCalls.some((c) => c.name === 'track_pin_failure')).toBe(false)
  }, 120_000)
})
