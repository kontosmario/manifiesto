import { useSyncExternalStore } from 'react'
import { InteractionManager } from 'react-native'
import { authFlowLog } from '@/lib/auth-flow-logger'

// Reactive store for the auth-transition splash overlay.
//
// State machine
// =============
//
//   hidden  ─show─►  showing  ─markLoaded (min elapsed)─►  hidden
//                       │      ─markLoaded (min not yet)─► success-pending
//                       │      ─reportError─►  error
//                       │      ─[MAX_VISIBLE_MS safety]─►  error(timeout)
//   success-pending  ─[min elapses]─►  hidden
//   error  ─hide─►  hidden  (used by retry / dismiss)
//
// The animation should NEVER be cut short by a fast response: even if
// the destination data loads in 800ms, we hold the splash for at
// least `MIN_VISIBLE_MS` so the warm fern entrance plays to
// completion (~2.4s). Conversely, if the request hangs forever, the
// `MAX_VISIBLE_MS` safety promotes the splash to `error(timeout)` so
// the user gets a "no internet" fallback instead of a stuck splash.

export type AuthTransitionPhase =
  | 'hidden'
  | 'showing'
  | 'success-pending'
  | 'error'

export type AuthTransitionErrorKind = 'network' | 'timeout' | 'unknown'

export interface AuthTransitionState {
  phase: AuthTransitionPhase
  errorKind?: AuthTransitionErrorKind
}

// 3000ms = WarmFernLogo entrance (2400ms) + small margin so the
// idle breath has a beat before dismissing. Keeps fast responses
// from clipping the animation mid-flight.
const MIN_VISIBLE_MS = 3000

// 15000ms = generous upper bound. If neither `markAuthTransitionLoaded`
// nor `reportAuthTransitionError` fires within this window, we assume
// the request is hung (no internet, slow backend, etc.) and surface
// the timeout error so the user can retry instead of staring at a
// spinner forever.
const MAX_VISIBLE_MS = 15000

let state: AuthTransitionState = { phase: 'hidden' }
let showStartedAt = 0
// Per-show override of MIN_VISIBLE_MS. Default null = use module constant.
// Set by `showAuthTransitionSplash({ minVisibleMs })` for callers like
// the unlock flow that want a faster fade-out (no need to hold the fern
// for the full 3s — the user just wants to be in the app).
let currentMinVisibleMs: number = MIN_VISIBLE_MS
let pendingHideTimer: ReturnType<typeof setTimeout> | null = null
let safetyTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function clearAllTimers() {
  if (pendingHideTimer) {
    clearTimeout(pendingHideTimer)
    pendingHideTimer = null
  }
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }
}

function setStateAndNotify(next: AuthTransitionState) {
  state = next
  notify()
}

/**
 * Open the splash. Starts the min-visible timer + the max-safety
 * timer. Subsequent calls while already showing are a no-op (the
 * existing timers keep running).
 *
 * @param options.minVisibleMs — override the default MIN_VISIBLE_MS
 *   (3000ms) for this show cycle. Useful for flows that need a quick
 *   fade-out once the destination is ready (e.g. unlock — the user
 *   already saw the fern during the FaceID prompt; after success they
 *   want to be in the app immediately, not wait 3s for the WarmFernLogo
 *   entrance to play through). Pass `0` for "hide as soon as
 *   `markAuthTransitionLoaded` fires".
 */
export function showAuthTransitionSplash(options?: { minVisibleMs?: number }) {
  if (state.phase === 'showing' || state.phase === 'success-pending') {
    authFlowLog('splash', 'show() NO-OP (already visible)', { phase: state.phase })
    return
  }
  clearAllTimers()
  showStartedAt = Date.now()
  currentMinVisibleMs = options?.minVisibleMs ?? MIN_VISIBLE_MS
  authFlowLog('splash', 'show() → phase=showing', { minVisibleMs: currentMinVisibleMs })
  safetyTimer = setTimeout(() => {
    safetyTimer = null
    // Only promote to timeout if still mid-flight. If success or
    // explicit error already arrived, the timer was cleared.
    if (state.phase === 'showing') {
      setStateAndNotify({ phase: 'error', errorKind: 'timeout' })
    }
  }, MAX_VISIBLE_MS)
  setStateAndNotify({ phase: 'showing' })
}

/**
 * Report that the destination has finished loading successfully.
 * Replaces the old "hide on isLoading=false" pattern. The splash
 * actually hides only after the min-visible window elapses — fast
 * responses get held back so the animation completes naturally.
 */
export function markAuthTransitionLoaded() {
  if (state.phase !== 'showing') {
    authFlowLog('splash', 'markLoaded() NO-OP', { phase: state.phase })
    return
  }
  authFlowLog('splash', 'markLoaded() called')
  // Clamp to non-negative: under backward clock skew (NTP correction,
  // user toggled date, daylight-savings glitch) `Date.now()` can move
  // backwards between `showAuthTransitionSplash` and here. Without the
  // clamp, `elapsed` goes negative, the `>= MIN_VISIBLE_MS` check
  // fails, AND the `setTimeout(MIN_VISIBLE_MS - elapsed)` below
  // schedules a fire wildly in the future (e.g. 30 minutes if the
  // clock jumped back). The splash would then pin until MAX_VISIBLE_MS
  // promotes it to error(timeout) — terrible UX for a fast login.
  // Treat backward skew as "elapsed = 0" and re-arm the normal
  // pending-hide path. Audit #7 7-T8 (Sprint N).
  const elapsed = Math.max(0, Date.now() - showStartedAt)
  authFlowLog('splash', 'markLoaded check', {
    elapsed,
    min: currentMinVisibleMs,
    immediate: elapsed >= currentMinVisibleMs,
  })
  if (elapsed >= currentMinVisibleMs) {
    clearAllTimers()
    // PREMIUM: defer the hide until the JS thread is idle. The caller
    // (typically RequireAuth) fires markLoaded as soon as its queries
    // resolve, but the destination screen hasn't painted yet — there's
    // still a render commit + native layout pass + first paint pending.
    // If we hide immediately, the splash fade-out (320ms) starts while
    // the destination is still mid-render, and during that fade the
    // BlockingScreenView green is visible behind the fading splash =
    // "pantalla verde" the user complained about.
    //
    // InteractionManager.runAfterInteractions waits for the JS thread
    // to be idle, which typically means: queries done + reconciliation
    // committed + first paint pushed to native. By the time the hide
    // fires, the destination is rendered → fade-out crossfades to
    // content, not to green.
    InteractionManager.runAfterInteractions(() => {
      // Re-check phase: callers can cancel via hide() between schedule
      // and fire.
      if (state.phase === 'showing') {
        authFlowLog('splash', 'InteractionManager fired → hidden')
        setStateAndNotify({ phase: 'hidden' })
      }
    })
    return
  }
  // Min not yet reached: stay visible until it does.
  authFlowLog('splash', 'phase → success-pending', { waitMs: currentMinVisibleMs - elapsed })
  setStateAndNotify({ phase: 'success-pending' })
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }
  pendingHideTimer = setTimeout(() => {
    pendingHideTimer = null
    if (state.phase === 'success-pending') {
      // Same InteractionManager defer as above so the elapsed >= min
      // path and the pending-timer path behave identically.
      InteractionManager.runAfterInteractions(() => {
        if (state.phase === 'success-pending') {
          setStateAndNotify({ phase: 'hidden' })
        }
      })
    }
  }, currentMinVisibleMs - elapsed)
}

/**
 * Report a load failure. Promotes the splash to `error` so the UI
 * can render the fallback (no-internet message + retry). Idempotent
 * once in error.
 */
export function reportAuthTransitionError(
  kind: AuthTransitionErrorKind = 'unknown',
) {
  if (state.phase === 'hidden') return
  if (state.phase === 'error') return
  clearAllTimers()
  setStateAndNotify({ phase: 'error', errorKind: kind })
}

/**
 * Force the splash into the `error` phase from any state (including
 * `hidden`). Used by the global connectivity watcher: when NetInfo
 * reports the device is offline we want the error fallback to take
 * over the screen immediately, not transition through `showing`
 * (which would start a 15s safety timer for nothing).
 *
 * Idempotent when already in `error` with the same kind.
 */
export function showAuthTransitionError(
  kind: AuthTransitionErrorKind = 'unknown',
) {
  if (state.phase === 'error' && state.errorKind === kind) return
  clearAllTimers()
  setStateAndNotify({ phase: 'error', errorKind: kind })
}

/**
 * Force-hide the splash regardless of phase. Called by the retry
 * flow (dismiss the error UI), the preview button in settings, and
 * legacy call sites that need to silence the splash unconditionally.
 */
export function hideAuthTransitionSplash() {
  if (state.phase === 'hidden') {
    authFlowLog('splash', 'hide() NO-OP (already hidden)')
    return
  }
  authFlowLog('splash', 'hide() → phase=hidden', { fromPhase: state.phase })
  clearAllTimers()
  setStateAndNotify({ phase: 'hidden' })
}

export function getIsAuthTransitionSplashVisible() {
  return state.phase !== 'hidden'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

/**
 * Subscribe to splash state from a React component. Returns the full
 * state object (`{ phase, errorKind? }`) and re-renders on changes.
 */
export function useAuthTransitionSplash() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
