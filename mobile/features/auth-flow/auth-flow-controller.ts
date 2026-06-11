// Driver del flujo auth — el ÚNICO lugar con IO. Sostiene el estado de
// la máquina, ejecuta efectos contra adapters inyectados y expone
// dispatch/subscribe. Singleton de módulo (mismo patrón que los stores
// del repo); `configureAuthFlow` inyecta adapters (reales en app/boot,
// fakes en tests y dev journeys).

import {
  initialAuthFlowState,
  transition,
  type AuthFlowEffect,
  type AuthFlowEvent,
  type AuthFlowState,
  type AuthTimer,
  type ProbesResult,
} from '@/features/auth-flow/auth-flow-machine'
import {
  BRIDGE_MIN_HOLD_MS,
  SAFETY_TIMEOUT_MS,
  SOAR_AWAY_MS,
} from '@/features/auth-flow/auth-flow-motion'
import { getLaunchEntranceRemainingMs } from '@/features/auth-flow/launch-splash-state'

export interface AuthFlowAdapters {
  runProbes: () => Promise<ProbesResult>
  promptBiometric: () => Promise<{ success: true } | { success: false; error?: string }>
  prefetchSnapshot: () => Promise<void>
  /** Fast path getSession / slow path restore con Keychain. */
  confirmSession: () => Promise<'ok' | 'login-required'>
  resolveDestinationRoute: () => Promise<string>
  navigate: (to: string) => void
  haptic: (feedback: 'success' | 'warning') => void
  markAppUnlocked: () => void
  resetAppLock: () => void
  /** Devuelve la función de cancelación. */
  schedule: (timer: AuthTimer, ms: number, cb: () => void) => () => void
  log: (message: string, extra?: Record<string, unknown>) => void
}

const TIMER_DURATIONS: Record<AuthTimer, number> = {
  'min-hold': BRIDGE_MIN_HOLD_MS,
  safety: SAFETY_TIMEOUT_MS,
  'reveal-done': SOAR_AWAY_MS,
}

const TIMER_EVENTS: Record<AuthTimer, AuthFlowEvent> = {
  'min-hold': { type: 'MIN_HOLD_ELAPSED' },
  safety: { type: 'SAFETY_ELAPSED' },
  'reveal-done': { type: 'REVEAL_DONE' },
}

let state: AuthFlowState = initialAuthFlowState
let adapters: AuthFlowAdapters | null = null
let prefetchPromise: Promise<void> | null = null
const cancelers = new Map<AuthTimer, () => void>()
// Vencimiento wall-clock de cada timer agendado. setTimeout puede
// starvearse cuando el JS thread está bloqueado (Metro lazy-bundling
// en Expo Go dev, mount pesado del home) — medido: min-hold de 550ms
// disparando 1.5s tarde. En cada dispatch flusheamos los vencidos.
const timerDueAt = new Map<AuthTimer, number>()
const listeners = new Set<() => void>()

export function configureAuthFlow(next: AuthFlowAdapters) {
  adapters = next
}

export function getAuthFlowState(): AuthFlowState {
  return state
}

export function subscribeAuthFlow(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetAuthFlowForTesting() {
  for (const cancel of cancelers.values()) cancel()
  cancelers.clear()
  timerDueAt.clear()
  state = initialAuthFlowState
  adapters = null
  prefetchPromise = null
}

/**
 * Adelanta timers vencidos por wall-clock cuyo callback sigue encolado
 * (JS thread bloqueado). Idempotente: el evento del timer flipea su
 * flag en la máquina, así que un doble-fire es no-op.
 */
function flushOverdueTimers() {
  if (timerDueAt.size === 0) return
  const now = Date.now()
  for (const [timer, dueAt] of [...timerDueAt]) {
    if (now < dueAt) continue
    timerDueAt.delete(timer)
    cancelers.get(timer)?.()
    cancelers.delete(timer)
    adapters?.log(`timer ${timer} vencido por wall-clock → flush`, {
      lateMs: now - dueAt,
    })
    process(TIMER_EVENTS[timer])
  }
}

function process(event: AuthFlowEvent) {
  if (!adapters) return
  const result = transition(state, event)
  const changed = result.state !== state
  state = result.state
  adapters.log(`${event.type} → ${state.phase}`, {
    effects: result.effects.map((e) => e.kind),
  })
  if (changed) for (const listener of listeners) listener()
  for (const effect of result.effects) execute(effect)
}

export function dispatchAuthFlow(event: AuthFlowEvent) {
  if (!adapters) return
  flushOverdueTimers()
  process(event)
}

function execute(effect: AuthFlowEffect) {
  const a = adapters
  if (!a) return
  switch (effect.kind) {
    case 'run-probes':
      void a.runProbes().then(
        (probes) => dispatchAuthFlow({ type: 'PROBES_RESOLVED', probes }),
        () =>
          dispatchAuthFlow({
            type: 'PROBES_RESOLVED',
            probes: {
              hasSession: false,
              shouldUseBiometric: false,
              pinSet: false,
              hasSavedCredentials: false,
              isUnlocked: false,
            },
          }),
      )
      return
    case 'prompt-biometric':
      void a.promptBiometric().then(
        (result) => {
          if (result.success) dispatchAuthFlow({ type: 'FACE_ID_OK' })
          else dispatchAuthFlow({ type: 'FACE_ID_FAIL', reason: 'cancel' })
        },
        () => dispatchAuthFlow({ type: 'FACE_ID_FAIL', reason: 'fail' }),
      )
      return
    case 'prefetch-snapshot':
      prefetchPromise = a.prefetchSnapshot()
      // Evitar unhandled rejection cuando nadie espera el prefetch aún;
      // el await en confirm-session-and-navigate maneja el error real.
      prefetchPromise.catch((error: unknown) => {
        a.log('prefetch failed', { error: String(error) })
      })
      return
    case 'confirm-session-and-navigate':
      void (async () => {
        const outcome = await a.confirmSession()
        if (outcome !== 'ok') {
          dispatchAuthFlow({ type: 'SESSION_RESTORE_FAILED' })
          return
        }
        a.markAppUnlocked()
        try {
          // Esperar el prefetch (si está en vuelo) para que el destino
          // resuelva con caches calientes; si falló, error de carga.
          if (prefetchPromise) await prefetchPromise
        } catch {
          dispatchAuthFlow({ type: 'LOAD_FAILED', kind: 'network' })
          return
        }
        const to = await a.resolveDestinationRoute()
        a.navigate(to)
        dispatchAuthFlow({ type: 'NAVIGATED' })
      })()
      return
    case 'navigate':
      a.navigate(effect.to)
      return
    case 'haptic':
      a.haptic(effect.feedback)
      return
    case 'mark-app-unlocked':
      a.markAppUnlocked()
      return
    case 'reset-app-lock':
      a.resetAppLock()
      return
    case 'schedule': {
      cancelers.get(effect.timer)?.()
      // El min-hold nunca vence antes de que el entrance del cold-start
      // splash termine: el reveal (soar) jamás corta el fern growth.
      const ms = effect.timer === 'min-hold'
        ? Math.max(TIMER_DURATIONS['min-hold'], getLaunchEntranceRemainingMs())
        : TIMER_DURATIONS[effect.timer]
      timerDueAt.set(effect.timer, Date.now() + ms)
      const cancel = a.schedule(effect.timer, ms, () => {
        cancelers.delete(effect.timer)
        timerDueAt.delete(effect.timer)
        dispatchAuthFlow(TIMER_EVENTS[effect.timer])
      })
      cancelers.set(effect.timer, cancel)
      return
    }
    case 'cancel-timers':
      for (const cancel of cancelers.values()) cancel()
      cancelers.clear()
      timerDueAt.clear()
      return
  }
}
