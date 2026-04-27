import { useSyncExternalStore } from 'react'

// Reactive store for the auth-transition splash overlay. Exposed as
// imperative `show/hide` actions (called from controllers, mutations,
// etc.) plus a `useAuthTransitionSplash()` hook so React components
// can subscribe.
//
// Why this exists: previously each loading gate (AppEntryGate,
// RequireAuth, /(app)/onboarding) rendered its own splash via
// BlockingScreenView and called `hideAuthTransitionSplash()` from a
// `useEffect` once its local query resolved. Across a multi-step
// navigation (login → / → /(app)/onboarding) that fired the splash
// entrance animation 2-3 times, with brief flashes of skeleton or
// blank screen between routes.
//
// The new model is a single splash mounted at the root layout,
// animated via opacity so it can fade in/out without remounting.
// Hide is debounced so a quick show → hide → show sequence stays
// "show" (no flicker).

let visible = false
let pendingHideTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const HIDE_DEBOUNCE_MS = 320

function notify() {
  for (const listener of listeners) listener()
}

function clearHideTimer() {
  if (pendingHideTimer) {
    clearTimeout(pendingHideTimer)
    pendingHideTimer = null
  }
}

export function showAuthTransitionSplash() {
  clearHideTimer()
  if (visible) return
  visible = true
  notify()
}

export function hideAuthTransitionSplash() {
  if (!visible) return
  // Debounced hide: if a `show` call lands within the window, the
  // pending hide is cancelled. Smooths over the chain of redirects
  // each clearing their own loading state in quick succession.
  clearHideTimer()
  pendingHideTimer = setTimeout(() => {
    pendingHideTimer = null
    visible = false
    notify()
  }, HIDE_DEBOUNCE_MS)
}

export function getIsAuthTransitionSplashVisible() {
  return visible
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return visible
}

/**
 * Subscribe to splash visibility from a React component. Returns the
 * current `visible` boolean and re-renders on changes.
 */
export function useAuthTransitionSplash() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
