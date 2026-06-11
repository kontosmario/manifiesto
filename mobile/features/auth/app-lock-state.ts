// App-lock state — a per-launch biometric re-confirmation gate.
//
// Why this exists:
//   Even when the Supabase session is valid (cached refresh token,
//   user already signed in), we want Face ID / Touch ID to act as a
//   "front door" on every cold start. Banks do this. The user
//   re-confirms identity before any financial data is visible.
//
// How it works:
//   The store is module-level state, so it resets to `false` on every
//   cold start (when the JS runtime is re-initialized). Once the user
//   passes the biometric prompt (or signs in via password), we flip
//   it to `true` and the AppEntryGate stops blocking.
//
//   Logout calls `resetAppLock()` so the next launch needs to unlock
//   again. (Without this, the in-process state would survive a
//   sign-out + sign-in cycle and the new user would skip the gate.)
//
//   Foreground-from-background re-lock IS implemented (2026-05-24):
//   `background-relock-watcher.tsx` calls `resetAppLock()` +
//   `router.replace('/')` when the app returns to foreground after
//   more than BACKGROUND_RELOCK_THRESHOLD_MS (60s) in background. The
//   pure decision lives in `background-relock.ts`.

import { useSyncExternalStore } from 'react'

let unlocked = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

// Sprint R-5 · unlockGrace — record the timestamp of the most recent
// successful unlock. The background-relock check reads this and skips
// the re-lock when a quick background dip (notification center peek,
// brief app switch) happens within the grace window. Reduces friction
// for "I opened the app, glanced away for 5 seconds, and now I need to
// FaceID again" scenarios.
let unlockedAt: number | null = null

export function isAppUnlocked() {
  return unlocked
}

/**
 * Returns the timestamp (ms) of the most recent successful unlock, or
 * null if the app was never unlocked in this session. Used by the
 * background-relock decision to honour the unlock grace window.
 */
export function getUnlockedAt(): number | null {
  return unlockedAt
}

export function markAppUnlocked() {
  // Refresh `unlockedAt` even if already unlocked — a re-confirmation
  // (e.g. user passed FaceID after a soft-lock) should reset the grace
  // window so the next background dip is still grace-protected.
  unlockedAt = Date.now()
  if (unlocked) return
  unlocked = true
  emit()
}

export function resetAppLock() {
  unlockedAt = null
  if (!unlocked) return
  unlocked = false
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Imperative subscription to lock-state changes. Used by non-React
 * consumers (e.g. the notification pending-route module that flushes a
 * deferred push tap after the user passes the lock screen).
 */
export function subscribeAppLock(listener: () => void): () => void {
  return subscribe(listener)
}

function getSnapshot() {
  return unlocked
}

// Server-side getSnapshot — never invoked in native, but RN web's
// SSR-style first-render path will call it. Lock starts closed.
function getServerSnapshot() {
  return false
}

export function useAppLockState(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
