// Module-level pending-route ref + unlock listener for the notification
// bridge. Separated out so the bridge stays a thin React shell and so we
// can also subscribe from `app-lock-state` without a circular dep.
//
// J-Auth1 defense: when the user taps a push while the app-lock is up,
// we stash the route here instead of navigating. Once `markAppUnlocked`
// runs, the bridge's listener flushes the route.
//
// Sprint L · Audit #5 L-2 + L-3 (2026-06-10):
//   The previous implementation stored just the raw route string. Two
//   composition bugs followed:
//
//   L-3 — staleness across a long lock delay: user taps push → app-lock
//   triggers → user walks away → 30 min later they unlock and the
//   bridge happily navigates them to an action that no longer makes
//   sense for the current context (e.g. a notification about a payment
//   that was already confirmed). We now stamp `queuedAt` at set-time
//   and discard on consume if older than PENDING_ROUTE_TTL_MS.
//
//   L-2 — sign-out leak on shared device: pendingRoute is a module-level
//   singleton, so it survives `signOut()`. User A taps push while
//   locked → signs out → User B signs in → User B's `markAppUnlocked`
//   fires → bridge consumes the leftover pendingRoute → User B
//   navigates into User A's deep link. We now expose
//   `clearPendingNotificationRoute()` so `logoutSession` (and the
//   SIGNED_OUT handler in `use-auth-session`) can explicitly clear
//   before the lock state ever transitions.

import { isAppUnlocked, subscribeAppLock } from '@/features/auth/app-lock-state'

/**
 * How long a queued notification route remains valid after being set.
 * 60 seconds is short enough that an unlock from a "fresh" tap still
 * navigates (the typical biometric flow is <10s) but long enough that
 * a temporarily forgotten Face ID prompt or backgrounded re-auth is
 * still honored. Anything longer risks navigating into stale state.
 */
export const PENDING_ROUTE_TTL_MS = 60_000

interface PendingRouteEntry {
  route: string
  queuedAt: number
}

let pendingRoute: PendingRouteEntry | null = null

export function setPendingNotificationRoute(route: string): void {
  pendingRoute = { route, queuedAt: Date.now() }
}

export function consumePendingNotificationRoute(): string | null {
  const entry = pendingRoute
  pendingRoute = null
  if (entry === null) return null
  // L-3: drop stale entries silently. The caller treats a null return
  // as "no pending route", which is the right behaviour — the user
  // should land on the default screen for their auth state, not be
  // teleported into yesterday's notification context.
  if (Date.now() - entry.queuedAt > PENDING_ROUTE_TTL_MS) {
    return null
  }
  return entry.route
}

export function peekPendingNotificationRoute(): string | null {
  if (pendingRoute === null) return null
  if (Date.now() - pendingRoute.queuedAt > PENDING_ROUTE_TTL_MS) {
    // Peek also honors the TTL so callers (e.g. boot-time decision
    // logic) don't act on a stale route they're about to discard.
    return null
  }
  return pendingRoute.route
}

/**
 * Sprint L · L-2 (2026-06-10): explicitly clears the queued route.
 * Called by `logoutSession` BEFORE `resetAppLock()` so the next lock
 * transition (post-login by a different user) cannot flush user A's
 * pending route to user B. Also called from the `SIGNED_OUT` handler
 * in `use-auth-session` as defense-in-depth — direct `signOut()` calls
 * that bypass `logoutSession` are still covered.
 */
export function clearPendingNotificationRoute(): void {
  pendingRoute = null
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
