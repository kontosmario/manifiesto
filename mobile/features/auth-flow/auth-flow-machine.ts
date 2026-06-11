// Máquina de estados PURA del flujo auth — spec 2026-06-11.
// Sin React, sin IO, sin timers: transition() devuelve el próximo
// estado + una lista de EFECTOS descriptivos que el driver
// (auth-flow-controller) ejecuta contra adapters. Los eventos fuera
// de estado son no-ops por construcción — esto reemplaza los guards
// con refs/flags del sistema anterior.

export type LockMethod = 'biometric' | 'pin'
export type BridgeErrorKind = 'network' | 'timeout' | 'unknown'
export type AuthJourney = 'unlock' | 'login' | 'signup'
export type AuthTimer = 'min-hold' | 'safety' | 'reveal-done'

export interface ProbesResult {
  hasSession: boolean
  /** Biometría disponible Y credenciales guardadas (gate principal). */
  shouldUseBiometric: boolean
  pinSet: boolean
  hasSavedCredentials: boolean
  /**
   * App-lock ya abierto en este launch (login con password / OAuth /
   * signup ya marcaron unlocked). Evita re-promptear Face ID cuando el
   * boot se re-entra post-login: va directo al bridge.
   */
  isUnlocked: boolean
}

interface BridgingState {
  phase: 'bridging'
  journey: AuthJourney
  /** El overlay reportó fade-in completo (invariante 1: navegar solo cubierto). */
  opaque: boolean
  /** La identidad está confirmada (FaceID/PIN ok, o LOGIN_SUCCESS llegó). */
  authed: boolean
  /** El router.replace al destino ya se ejecutó. */
  navigated: boolean
  minHoldElapsed: boolean
  destinationReady: boolean
}

export type AuthFlowState =
  | { phase: 'idle' }
  | { phase: 'probing' }
  | { phase: 'guest' }
  | { phase: 'locked'; method: LockMethod }
  | BridgingState
  | { phase: 'bridge-error'; journey: AuthJourney; kind: BridgeErrorKind; navigated: boolean }
  | { phase: 'revealing' }
  | { phase: 'ready' }
  | { phase: 'fallback-login' }

export type AuthFlowEvent =
  | { type: 'BOOT' }
  | { type: 'PROBES_RESOLVED'; probes: ProbesResult }
  | { type: 'FACE_ID_OK' }
  | { type: 'FACE_ID_FAIL'; reason: 'cancel' | 'fail' }
  | { type: 'PIN_OK' }
  | { type: 'USE_PASSWORD_FALLBACK' }
  | { type: 'LOGIN_PENDING' }
  | { type: 'LOGIN_SUCCESS' }
  | { type: 'SIGNUP_SUCCESS' }
  | { type: 'LOGIN_FAILED' }
  | { type: 'EMAIL_CONFIRMATION_PENDING' }
  | { type: 'SESSION_RESTORE_FAILED' }
  | { type: 'BRIDGE_OPAQUE' }
  | { type: 'NAVIGATED' }
  | { type: 'DESTINATION_READY' }
  | { type: 'MIN_HOLD_ELAPSED' }
  | { type: 'SAFETY_ELAPSED' }
  | { type: 'LOAD_FAILED'; kind: BridgeErrorKind }
  | { type: 'RETRY' }
  | { type: 'REVEAL_DONE' }
  | { type: 'RELOCK'; source: 'background' | 'inactivity' }
  | { type: 'LOGOUT' }

export type AuthFlowEffect =
  | { kind: 'run-probes' }
  | { kind: 'prompt-biometric' }
  | { kind: 'prefetch-snapshot' }
  | { kind: 'confirm-session-and-navigate' }
  | { kind: 'navigate'; to: string }
  | { kind: 'haptic'; feedback: 'success' | 'warning' }
  | { kind: 'mark-app-unlocked' }
  | { kind: 'reset-app-lock' }
  | { kind: 'schedule'; timer: AuthTimer }
  | { kind: 'cancel-timers' }

export interface TransitionResult {
  state: AuthFlowState
  effects: AuthFlowEffect[]
}

export const initialAuthFlowState: AuthFlowState = { phase: 'idle' }

const NOOP = (state: AuthFlowState): TransitionResult => ({ state, effects: [] })

function enterBridging(
  journey: AuthJourney,
  options: { authed: boolean; haptic: boolean },
): TransitionResult {
  const effects: AuthFlowEffect[] = []
  if (options.haptic) effects.push({ kind: 'haptic', feedback: 'success' })
  effects.push({ kind: 'schedule', timer: 'min-hold' }, { kind: 'schedule', timer: 'safety' })
  return {
    state: {
      phase: 'bridging',
      journey,
      opaque: false,
      authed: options.authed,
      navigated: false,
      minHoldElapsed: false,
      destinationReady: false,
    },
    effects,
  }
}

/**
 * Tras actualizar un flag del bridging, decide los próximos pasos:
 *  - opaque ∧ authed ∧ ¬navigated → confirmar sesión y navegar (cubierto)
 *  - navigated ∧ minHold ∧ destReady → revealing (soar-away)
 */
function advanceBridge(state: BridgingState): TransitionResult {
  const effects: AuthFlowEffect[] = []
  if (state.opaque && state.authed && !state.navigated) {
    effects.push({ kind: 'confirm-session-and-navigate' })
  }
  if (state.navigated && state.minHoldElapsed && state.destinationReady) {
    effects.push({ kind: 'cancel-timers' }, { kind: 'schedule', timer: 'reveal-done' })
    return { state: { phase: 'revealing' }, effects }
  }
  return { state, effects }
}

function fallbackLogin(): TransitionResult {
  return {
    state: { phase: 'fallback-login' },
    effects: [{ kind: 'navigate', to: '/(auth)/login' }],
  }
}

export function transition(state: AuthFlowState, event: AuthFlowEvent): TransitionResult {
  switch (event.type) {
    case 'BOOT':
      // Re-ejecutable desde fases TERMINALES (guest/fallback-login/ready):
      // el boot se re-monta cuando un flujo viejo o un bounce de
      // RequireAuth navega a '/'. Mid-journey (probing/locked/bridging/
      // revealing) es no-op — no se interrumpe un viaje en curso.
      if (
        state.phase !== 'idle' &&
        state.phase !== 'guest' &&
        state.phase !== 'fallback-login' &&
        state.phase !== 'ready'
      ) {
        return NOOP(state)
      }
      return { state: { phase: 'probing' }, effects: [{ kind: 'run-probes' }] }

    case 'PROBES_RESOLVED': {
      if (state.phase !== 'probing') return NOOP(state)
      const { probes } = event
      if (!probes.hasSession) {
        const to = probes.shouldUseBiometric && probes.hasSavedCredentials
          ? '/(auth)/login?autoBiometric=1'
          : '/(auth)/welcome'
        return { state: { phase: 'guest' }, effects: [{ kind: 'navigate', to }] }
      }
      if (probes.isUnlocked) {
        // Ya desbloqueado en este launch (post-login con password,
        // OAuth, o bounce a '/'): sin re-prompt — el bridge cubre el
        // gate → destino. Sin mark-app-unlocked (no extender el grace
        // window del re-lock).
        const unlocked = enterBridging('unlock', { authed: true, haptic: false })
        return {
          state: unlocked.state,
          effects: [{ kind: 'prefetch-snapshot' }, ...unlocked.effects],
        }
      }
      if (probes.shouldUseBiometric) {
        return {
          state: { phase: 'locked', method: 'biometric' },
          effects: [{ kind: 'prefetch-snapshot' }, { kind: 'prompt-biometric' }],
        }
      }
      if (probes.pinSet) {
        return {
          state: { phase: 'locked', method: 'pin' },
          effects: [{ kind: 'prefetch-snapshot' }],
        }
      }
      // Sin lock configurado: el bridge cubre gate → destino.
      const direct = enterBridging('unlock', { authed: true, haptic: false })
      return {
        state: direct.state,
        effects: [
          { kind: 'mark-app-unlocked' },
          { kind: 'prefetch-snapshot' },
          ...direct.effects,
        ],
      }
    }

    case 'FACE_ID_OK':
      if (state.phase !== 'locked' || state.method !== 'biometric') return NOOP(state)
      return enterBridging('unlock', { authed: true, haptic: true })

    case 'FACE_ID_FAIL':
      if (state.phase !== 'locked' || state.method !== 'biometric') return NOOP(state)
      return fallbackLogin()

    case 'PIN_OK':
      if (state.phase !== 'locked' || state.method !== 'pin') return NOOP(state)
      return enterBridging('unlock', { authed: true, haptic: true })

    case 'USE_PASSWORD_FALLBACK':
      if (state.phase !== 'locked') return NOOP(state)
      return fallbackLogin()

    case 'LOGIN_PENDING':
      if (state.phase !== 'guest' && state.phase !== 'fallback-login' && state.phase !== 'locked') {
        return NOOP(state)
      }
      return enterBridging('login', { authed: false, haptic: false })

    case 'LOGIN_SUCCESS':
    case 'SIGNUP_SUCCESS': {
      const journey: AuthJourney = event.type === 'SIGNUP_SUCCESS' ? 'signup' : 'login'
      if (state.phase === 'bridging') {
        return advanceBridge({ ...state, authed: true })
      }
      if (state.phase === 'guest' || state.phase === 'fallback-login') {
        // OAuth callback / FaceID-desde-login sin LOGIN_PENDING previo.
        return enterBridging(journey, { authed: true, haptic: true })
      }
      return NOOP(state)
    }

    case 'LOGIN_FAILED':
    case 'EMAIL_CONFIRMATION_PENDING':
      if (state.phase !== 'bridging') return NOOP(state)
      return { state: { phase: 'guest' }, effects: [{ kind: 'cancel-timers' }] }

    case 'SESSION_RESTORE_FAILED': {
      if (state.phase !== 'bridging') return NOOP(state)
      const fallback = fallbackLogin()
      return {
        state: fallback.state,
        effects: [{ kind: 'cancel-timers' }, ...fallback.effects],
      }
    }

    case 'BRIDGE_OPAQUE':
      if (state.phase !== 'bridging' || state.opaque) return NOOP(state)
      return advanceBridge({ ...state, opaque: true })

    case 'NAVIGATED':
      if (state.phase !== 'bridging' || state.navigated) return NOOP(state)
      return advanceBridge({ ...state, navigated: true })

    case 'DESTINATION_READY':
      if (state.phase !== 'bridging' || state.destinationReady) return NOOP(state)
      return advanceBridge({ ...state, destinationReady: true })

    case 'MIN_HOLD_ELAPSED':
      if (state.phase !== 'bridging' || state.minHoldElapsed) return NOOP(state)
      return advanceBridge({ ...state, minHoldElapsed: true })

    case 'SAFETY_ELAPSED':
      if (state.phase !== 'bridging') return NOOP(state)
      return {
        state: {
          phase: 'bridge-error',
          journey: state.journey,
          kind: 'timeout',
          navigated: state.navigated,
        },
        effects: [{ kind: 'cancel-timers' }],
      }

    case 'LOAD_FAILED':
      if (state.phase !== 'bridging') return NOOP(state)
      return {
        state: {
          phase: 'bridge-error',
          journey: state.journey,
          kind: event.kind,
          navigated: state.navigated,
        },
        effects: [{ kind: 'cancel-timers' }],
      }

    case 'RETRY': {
      if (state.phase !== 'bridge-error') return NOOP(state)
      const next: BridgingState = {
        phase: 'bridging',
        journey: state.journey,
        opaque: true, // el overlay nunca se escondió durante el error
        authed: true,
        navigated: state.navigated,
        minHoldElapsed: true, // el error ya consumió el momento de marca
        destinationReady: false,
      }
      const advanced = advanceBridge(next)
      return {
        state: advanced.state,
        effects: [
          { kind: 'prefetch-snapshot' },
          { kind: 'schedule', timer: 'safety' },
          ...advanced.effects,
        ],
      }
    }

    case 'REVEAL_DONE':
      if (state.phase !== 'revealing') return NOOP(state)
      return { state: { phase: 'ready' }, effects: [] }

    case 'RELOCK':
      if (state.phase !== 'ready') return NOOP(state)
      return {
        state: { phase: 'probing' },
        effects: [
          { kind: 'reset-app-lock' },
          { kind: 'navigate', to: '/' },
          { kind: 'run-probes' },
        ],
      }

    case 'LOGOUT':
      return { state: { phase: 'guest' }, effects: [{ kind: 'cancel-timers' }] }
  }
}

export type OverlayMode = 'hidden' | 'bridge' | 'revealing' | { error: BridgeErrorKind }

/** Derivación para el TransitionOverlay: qué renderizar según fase. */
export function getOverlayMode(state: AuthFlowState): OverlayMode {
  switch (state.phase) {
    case 'bridging':
      return 'bridge'
    case 'revealing':
      return 'revealing'
    case 'bridge-error':
      return { error: state.kind }
    default:
      return 'hidden'
  }
}
