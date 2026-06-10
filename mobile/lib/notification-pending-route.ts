// Module-level pending-route ref + unlock listener for the notification
// bridge. Separated out so the bridge stays a thin React shell and so we
// can also subscribe from `app-lock-state` without a circular dep.
//
// J-Auth1 defense: when the user taps a push while the app-lock is up,
// we stash the route here instead of navigating. Once `markAppUnlocked`
// runs, the bridge's listener flushes the route.

import { isAppUnlocked, subscribeAppLock } from '@/features/auth/app-lock-state'

let pendingRoute: string | null = null

export function setPendingNotificationRoute(route: string): void {
  pendingRoute = route
}

export function consumePendingNotificationRoute(): string | null {
  const value = pendingRoute
  pendingRoute = null
  return value
}

export function peekPendingNotificationRoute(): string | null {
  return pendingRoute
}

/**
 * Subscribes to app-lock state transitions and fires `onUnlock` when
 * the lock flips from locked → unlocked. Returns an unsubscribe handle.
 *
 * Implemented on top of `subscribeAppLock` (a thin emitter wrapper)
 * instead of a `useAppLockState` hook because the notification bridge
 * needs to react to the unlock even when its own component is not
 * re-rendering for some other reason.
 */
export function subscribeToAppUnlock(onUnlock: () => void): () => void {
  let wasUnlocked = isAppUnlocked()
  return subscribeAppLock(() => {
    const nowUnlocked = isAppUnlocked()
    if (!wasUnlocked && nowUnlocked) {
      wasUnlocked = nowUnlocked
      onUnlock()
    } else {
      wasUnlocked = nowUnlocked
    }
  })
}
