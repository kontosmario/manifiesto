// J-Auth1 — ensure the push-tap pending-route module preserves the
// route across the lock window and flushes once `markAppUnlocked()` fires.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  vi.resetModules()
  const lockMod = await import('@/features/auth/app-lock-state')
  // Ensure a clean start-of-launch state: locked.
  lockMod.resetAppLock()
})

afterEach(async () => {
  const routeMod = await import('@/lib/notification-pending-route')
  // Drain any leftover pending route so other test files don't see it.
  routeMod.consumePendingNotificationRoute()
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
