// J-Auth1 — ensure the push-tap pending-route module preserves the
// route across the lock window and flushes once `markAppUnlocked()` fires.
//
// Sprint L · Audit #5 L-2 + L-3 (2026-06-10): adds coverage for the
// explicit clear surface (sign-out leak fix) and the 60s TTL (long
// lock-delay staleness fix).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  vi.resetModules()
  const lockMod = await import('@/features/auth/app-lock-state')
  // Ensure a clean start-of-launch state: locked.
  lockMod.resetAppLock()
})

afterEach(async () => {
  // Real timers — earlier tests may have flipped to fake.
  vi.useRealTimers()
  const routeMod = await import('@/lib/notification-pending-route')
  // Drain any leftover pending route so other test files don't see it.
  routeMod.clearPendingNotificationRoute()
  const lockMod = await import('@/features/auth/app-lock-state')
  lockMod.resetAppLock()
})

describe('notification-pending-route', () => {
  it('set then consume returns the route once and then null', async () => {
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/(tabs)/home')
    expect(consumePendingNotificationRoute()).toBe('/(app)/(tabs)/home')
    expect(consumePendingNotificationRoute()).toBeNull()
  })

  it('peek does not drain the pending route', async () => {
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
      peekPendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/notifications')
    expect(peekPendingNotificationRoute()).toBe('/(app)/notifications')
    expect(peekPendingNotificationRoute()).toBe('/(app)/notifications')
    expect(consumePendingNotificationRoute()).toBe('/(app)/notifications')
  })

  it('subscribeToAppUnlock fires only on locked → unlocked transitions', async () => {
    const { subscribeToAppUnlock } = await import('@/lib/notification-pending-route')
    const { markAppUnlocked, resetAppLock } = await import(
      '@/features/auth/app-lock-state'
    )

    const onUnlock = vi.fn()
    const unsubscribe = subscribeToAppUnlock(onUnlock)

    // Start locked (beforeEach reset). Mark unlocked → fires once.
    markAppUnlocked()
    expect(onUnlock).toHaveBeenCalledTimes(1)

    // Marking again while already unlocked is a no-op (no emit either).
    markAppUnlocked()
    expect(onUnlock).toHaveBeenCalledTimes(1)

    // Reset back to locked → no fire (we only fire on rising edge).
    resetAppLock()
    expect(onUnlock).toHaveBeenCalledTimes(1)

    // Unlock again → fires again.
    markAppUnlocked()
    expect(onUnlock).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('L-2: clearPendingNotificationRoute drops any queued route', async () => {
    const {
      setPendingNotificationRoute,
      clearPendingNotificationRoute,
      consumePendingNotificationRoute,
      peekPendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/(tabs)/home')
    clearPendingNotificationRoute()
    expect(peekPendingNotificationRoute()).toBeNull()
    expect(consumePendingNotificationRoute()).toBeNull()
  })

  it('L-2: clearPendingNotificationRoute is a no-op when nothing is queued', async () => {
    const {
      clearPendingNotificationRoute,
      consumePendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    expect(() => clearPendingNotificationRoute()).not.toThrow()
    expect(consumePendingNotificationRoute()).toBeNull()
  })

  it('L-3: consume returns the route when called before the TTL elapses', async () => {
    vi.useFakeTimers()
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
      PENDING_ROUTE_TTL_MS,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/control')
    vi.advanceTimersByTime(PENDING_ROUTE_TTL_MS - 1)
    expect(consumePendingNotificationRoute()).toBe('/(app)/control')
  })

  it('L-3: consume drops the route once TTL has elapsed', async () => {
    vi.useFakeTimers()
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
      PENDING_ROUTE_TTL_MS,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/expenses/edit/abc')
    vi.advanceTimersByTime(PENDING_ROUTE_TTL_MS + 1)
    expect(consumePendingNotificationRoute()).toBeNull()
  })

  it('L-3: peek honors the TTL', async () => {
    vi.useFakeTimers()
    const {
      setPendingNotificationRoute,
      peekPendingNotificationRoute,
      PENDING_ROUTE_TTL_MS,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/notifications')
    vi.advanceTimersByTime(PENDING_ROUTE_TTL_MS + 1)
    expect(peekPendingNotificationRoute()).toBeNull()
  })

  // Sprint M · Audit #7 L-1 / 7-T2 (2026-06-14): negative delta → null
  it('M-L-1: consume drops the route when delta is negative (clock backwards)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/control')
    // Move clock backwards so Date.now() < queuedAt → delta < 0
    vi.setSystemTime(1_000_000)
    expect(consumePendingNotificationRoute()).toBeNull()
  })

  it('M-L-1: peek drops the route when delta is negative', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    const {
      setPendingNotificationRoute,
      peekPendingNotificationRoute,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/(app)/control')
    vi.setSystemTime(1_000_000)
    expect(peekPendingNotificationRoute()).toBeNull()
  })

  it('L-3: TTL constant is 60 seconds', async () => {
    const { PENDING_ROUTE_TTL_MS } = await import(
      '@/lib/notification-pending-route'
    )
    expect(PENDING_ROUTE_TTL_MS).toBe(60_000)
  })

  it('L-3: setPendingNotificationRoute resets the queuedAt clock', async () => {
    vi.useFakeTimers()
    const {
      setPendingNotificationRoute,
      consumePendingNotificationRoute,
      PENDING_ROUTE_TTL_MS,
    } = await import('@/lib/notification-pending-route')

    setPendingNotificationRoute('/old')
    vi.advanceTimersByTime(PENDING_ROUTE_TTL_MS + 10)
    setPendingNotificationRoute('/new')
    vi.advanceTimersByTime(PENDING_ROUTE_TTL_MS - 1)
    expect(consumePendingNotificationRoute()).toBe('/new')
  })

  it('subscribeToAppUnlock unsubscribe stops further events', async () => {
    const { subscribeToAppUnlock } = await import('@/lib/notification-pending-route')
    const { markAppUnlocked, resetAppLock } = await import(
      '@/features/auth/app-lock-state'
    )

    const onUnlock = vi.fn()
    const unsubscribe = subscribeToAppUnlock(onUnlock)
    unsubscribe()

    markAppUnlocked()
    expect(onUnlock).not.toHaveBeenCalled()
    resetAppLock()
    markAppUnlocked()
    expect(onUnlock).not.toHaveBeenCalled()
  })
})
