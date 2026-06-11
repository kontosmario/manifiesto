import { useSyncExternalStore } from 'react'
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
let currentMinVisibleMs: number = MIN_VISIBLE_MS
// Cuando true, el splash no se esconde con markLoaded — espera a que
// `markDestinationReady()` fire (típicamente desde HomeScreen cuando el
// snapshot data está disponible). Garantiza zero "green gap" entre el
// splash y el content del destination.
let destinationRequired = false
let destinationReady = false
// Si markLoaded fire pero destinationReady=false todavía, marcamos esto
// para que cuando destination ready fire, el splash se esconda.
let authReadyFired = false
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
export function showAuthTransitionSplash(options?: {
  minVisibleMs?: number
  /**
   * Si true, el splash NO se esconde con markAuthTransitionLoaded.
   * Espera a que markDestinationReady() fire. Usado en flows post-auth
   * donde el destination (home) tiene su propio loading state que
   * debemos esperar antes de transition.
   */
  requireDestination?: boolean
}) {
  if (state.phase === 'showing' || state.phase === 'success-pending') {
    authFlowLog('splash', 'show() NO-OP (already visible)', { phase: state.phase })
    return
  }
  clearAllTimers()
  showStartedAt = Date.now()
  currentMinVisibleMs = options?.minVisibleMs ?? MIN_VISIBLE_MS
  destinationRequired = options?.requireDestination ?? false
  destinationReady = false
  authReadyFired = false
  authFlowLog('splash', 'show() → phase=showing', {
    minVisibleMs: currentMinVisibleMs,
    requireDestination: destinationRequired,
  })
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
/**
 * Marca que el auth (FaceID/password) acaba de completarse con success.
 *
 * Resetea el timer del splash y baja el minVisibleMs a 0. Esto significa
 * que el splash se va a esconder apenas markAuthTransitionLoaded fire
 * (típicamente ~30-100ms post-auth desde RequireAuth).
 *
 * Por qué min=0:
 * - El fade-out de 260ms del overlay YA ES la transición premium visible
 * - El user pidió "al instante de autenticar" — min>0 + setTimeout drift
 *   del JS thread agregaba 1-2s extra de delay (logs lo confirmaron)
 * - El base layer del UnlockScreen + BlockingScreenView (ambos con fern)
 *   garantizan que el fade-out no revele verde
 *
 * Total user-visible post-auth con min=0:
 *   ~30ms markLoaded latency + 260ms fade-out = 290ms
 *
 * Cubre el caso: si el FaceID tomó 4s pero el original min=3000 ya pasó,
 * markAuthSuccess garantiza que markLoaded se evalúe nuevamente con el
 * timer reseteado (no con elapsed=4000 que dispararía immediate hide).
 */
const POST_AUTH_MIN_VISIBLE_MS = 0

export function markAuthSuccess() {
  if (state.phase !== 'showing' && state.phase !== 'success-pending') {
    authFlowLog('splash', 'markAuthSuccess NO-OP (splash not visible)', { phase: state.phase })
    return
  }
  authFlowLog('splash', 'markAuthSuccess → timer reset', {
    fromPhase: state.phase,
    newMinVisibleMs: POST_AUTH_MIN_VISIBLE_MS,
  })
  // Si ya estaba success-pending (markLoaded ya firó), volvemos a showing
  // para que el siguiente markLoaded cuente desde el nuevo timer.
  clearAllTimers()
  showStartedAt = Date.now()
  currentMinVisibleMs = POST_AUTH_MIN_VISIBLE_MS
  if (state.phase === 'success-pending') {
    setStateAndNotify({ phase: 'showing' })
  }
  // Re-arm el safety timer
  safetyTimer = setTimeout(() => {
    safetyTimer = null
    if (state.phase === 'showing') {
      setStateAndNotify({ phase: 'error', errorKind: 'timeout' })
    }
  }, MAX_VISIBLE_MS)
}

/**
 * Marca que el destination (home, en general) terminó de cargar
 * (snapshot, queries, render). Esconde el splash si requireDestination
 * estaba activo Y auth ya fue marcado loaded.
 *
 * Llamado típicamente desde HomeScreen cuando snapshot.data está disponible.
 */
export function markDestinationReady() {
  if (state.phase !== 'showing' && state.phase !== 'success-pending') {
    authFlowLog('splash', 'markDestinationReady() NO-OP', { phase: state.phase })
    return
  }
  authFlowLog('splash', 'markDestinationReady() called', {
    destinationRequired,
    authReadyFired,
  })
  destinationReady = true
  // Si auth ya fue marcado, escondemos ahora.
  if (authReadyFired) {
    authFlowLog('splash', 'destination ready + auth ready → hidden')
    clearAllTimers()
    setStateAndNotify({ phase: 'hidden' })
  }
}

export function markAuthTransitionLoaded() {
  if (state.phase !== 'showing') {
    authFlowLog('splash', 'markLoaded() NO-OP', { phase: state.phase })
    return
  }
  authFlowLog('splash', 'markLoaded() called', { destinationRequired, destinationReady })
  authReadyFired = true

  // Si requireDestination=true y aún no llegó la señal del destination,
  // mantener el splash visible. Cuando markDestinationReady fire, se
  // esconde. Safety: MAX_VISIBLE_MS forzará hide si destination nunca llega.
  if (destinationRequired && !destinationReady) {
    authFlowLog('splash', 'waiting for destination ready')
    setStateAndNotify({ phase: 'success-pending' })
    return
  }

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
    // Hide immediato — el base layer del UnlockScreen + BlockingScreenView
    // ya rendean welcomeBg + WarmFernLogo, entonces el fade-out NO revela
    // verde. NO usar InteractionManager.runAfterInteractions: cuando el
    // JS thread está busy rendering home, puede demorar 500-1500ms más
    // → splash queda colgado innecesariamente.
    authFlowLog('splash', 'markLoaded → hidden inmediato (elapsed >= min)')
    setStateAndNotify({ phase: 'hidden' })
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
      authFlowLog('splash', 'pendingHideTimer fired → hidden')
      setStateAndNotify({ phase: 'hidden' })
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
