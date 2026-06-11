# Auth Flow Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir la orquestación del flujo auth (cold start, Face ID, PIN, login, signup, re-lock) como máquina de estados pura + driver con IO + boot surface única, según `docs/superpowers/specs/2026-06-11-auth-flow-refactor-design.md`.

**Architecture:** Máquina pura (`transition(state, event) → {state, effects[]}`) sin React ni IO; un driver singleton ejecuta efectos contra adapters inyectados; las pantallas emiten eventos y renderizan estado. Una sola navegación por viaje, emitida solo con el bridge opaco. 5 etapas, cada una probable en Expo Go.

**Tech Stack:** TypeScript, expo-router, React Query, Reanimated 4, vitest (node env, sin React renderer — `tests/unit/*.test.ts` con alias `@ → mobile/`).

**Reglas globales del repo (aplican a TODAS las tareas):**
- `npm run validate` corre typecheck+lint+tests; los tests de integración RLS fallan sin `supabase start` (baseline conocido — ignorar esos 3 archivos).
- vitest NO tiene React renderer: solo módulos puros. No testear hooks con estado.
- No usar `Intl` dentro de worklets; `Easing` siempre de `react-native-reanimated`.
- Comandos: correr desde `/Users/mario/apps/manifiesto` salvo indicación.
- Commits frecuentes, mensajes `feat(auth-flow): …` / `refactor(auth): …`, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## ETAPA 1 — Máquina + driver + dev journeys (el flujo vivo NO cambia)

### Task 1: Tokens de motion

**Files:**
- Create: `mobile/features/auth-flow/auth-flow-motion.ts`

- [ ] **Step 1: Crear el archivo de tokens**

```ts
// Tokens de timing del flujo auth — spec 2026-06-11 (validados con
// docs/auth-flow-demo.html). Cambiar el feel = cambiar un número acá.

/** Fade-in del bridge sobre la superficie fern idéntica. */
export const BRIDGE_FADE_IN_MS = 180
/** Piso del momento de marca post-auth (adaptativo: espera además DESTINATION_READY). */
export const BRIDGE_MIN_HOLD_MS = 1200
/** Soar-away: translateY -60, scale 1.15, fade out. */
export const SOAR_AWAY_MS = 550
/** Fade del auth stack hacia login en cancel/fail (ya existe en (auth)/_layout). */
export const LOGIN_FALLBACK_FADE_MS = 240
/** Bridge colgado sin DESTINATION_READY → bridge-error(timeout). */
export const SAFETY_TIMEOUT_MS = 15000

export const BRIDGE_SCALE_FROM = 0.97
export const SOAR_SCALE_TO = 1.15
export const SOAR_TRANSLATE_Y = -60
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add mobile/features/auth-flow/auth-flow-motion.ts
git commit -m "feat(auth-flow): tokens de motion del spec 2026-06-11"
```

---

### Task 2: Máquina de estados pura

**Files:**
- Create: `mobile/features/auth-flow/auth-flow-machine.ts`
- Test: `tests/unit/auth-flow-machine.test.ts`

- [ ] **Step 1: Escribir los tests (los 5 viajes + edges) — deben FALLAR**

```ts
import { describe, expect, it } from 'vitest'
import {
  initialAuthFlowState,
  transition,
  getOverlayMode,
  type AuthFlowEvent,
  type AuthFlowState,
} from '@/features/auth-flow/auth-flow-machine'

const PROBES_LOCKED_BIO = {
  hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true,
}
const PROBES_LOCKED_PIN = {
  hasSession: true, shouldUseBiometric: false, pinSet: true, hasSavedCredentials: false,
}
const PROBES_NO_LOCK = {
  hasSession: true, shouldUseBiometric: false, pinSet: false, hasSavedCredentials: false,
}
const PROBES_GUEST = {
  hasSession: false, shouldUseBiometric: false, pinSet: false, hasSavedCredentials: false,
}
const PROBES_GUEST_WITH_CREDS = {
  hasSession: false, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true,
}

/** Aplica eventos en secuencia, devolviendo estado final + todos los efectos. */
function run(events: AuthFlowEvent[], from: AuthFlowState = initialAuthFlowState) {
  let state = from
  const effects = []
  for (const event of events) {
    const result = transition(state, event)
    state = result.state
    effects.push(...result.effects.map((e) => e.kind))
  }
  return { state, effects }
}

describe('V1 — cold start + Face ID success', () => {
  it('BOOT → probing con run-probes', () => {
    const r = transition(initialAuthFlowState, { type: 'BOOT' })
    expect(r.state.phase).toBe('probing')
    expect(r.effects).toEqual([{ kind: 'run-probes' }])
  })

  it('probes con sesión+biometría → locked + prompt ∥ prefetch', () => {
    const r = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO }])
    expect(r.state).toEqual({ phase: 'locked', method: 'biometric' })
    expect(r.effects).toContain('prefetch-snapshot')
    expect(r.effects).toContain('prompt-biometric')
  })

  it('FACE_ID_OK → bridging con haptic + timers; navega recién con BRIDGE_OPAQUE', () => {
    const base = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
    ])
    const ok = transition(base.state, { type: 'FACE_ID_OK' })
    expect(ok.state.phase).toBe('bridging')
    expect(ok.effects.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['haptic', 'schedule']),
    )
    // INVARIANTE 1: sin navigate hasta BRIDGE_OPAQUE
    expect(ok.effects.map((e) => e.kind)).not.toContain('confirm-session-and-navigate')
    const opaque = transition(ok.state, { type: 'BRIDGE_OPAQUE' })
    expect(opaque.effects.map((e) => e.kind)).toContain('confirm-session-and-navigate')
  })

  it('revealing requiere navigated ∧ min-hold ∧ destination-ready (en cualquier orden)', () => {
    const toBridge = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
      { type: 'BRIDGE_OPAQUE' },
      { type: 'NAVIGATED' },
    ])
    const a = transition(toBridge.state, { type: 'DESTINATION_READY' })
    expect(a.state.phase).toBe('bridging') // falta min-hold
    const b = transition(a.state, { type: 'MIN_HOLD_ELAPSED' })
    expect(b.state.phase).toBe('revealing')
    expect(b.effects.map((e) => e.kind)).toContain('cancel-timers')
    const c = transition(b.state, { type: 'REVEAL_DONE' })
    expect(c.state.phase).toBe('ready')
  })

  it('orden inverso (min-hold antes que destination) también revela', () => {
    const r = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
      { type: 'BRIDGE_OPAQUE' },
      { type: 'NAVIGATED' },
      { type: 'MIN_HOLD_ELAPSED' },
      { type: 'DESTINATION_READY' },
      { type: 'REVEAL_DONE' },
    ])
    expect(r.state.phase).toBe('ready')
  })
})

describe('V2 — Face ID cancel/fail', () => {
  it('FACE_ID_FAIL → fallback-login + navigate sin bridge', () => {
    const base = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
    ])
    const r = transition(base.state, { type: 'FACE_ID_FAIL', reason: 'cancel' })
    expect(r.state.phase).toBe('fallback-login')
    expect(r.effects).toEqual([{ kind: 'navigate', to: '/(auth)/login' }])
    expect(getOverlayMode(r.state)).toBe('hidden')
  })
})

describe('V3 — PIN', () => {
  it('probes con PIN sin biometría → locked:pin con prefetch, sin prompt', () => {
    const r = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_PIN }])
    expect(r.state).toEqual({ phase: 'locked', method: 'pin' })
    expect(r.effects).toContain('prefetch-snapshot')
    expect(r.effects).not.toContain('prompt-biometric')
  })

  it('PIN_OK entra al mismo bridge', () => {
    const base = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_PIN }])
    const r = transition(base.state, { type: 'PIN_OK' })
    expect(r.state.phase).toBe('bridging')
  })

  it('USE_PASSWORD_FALLBACK → fallback-login', () => {
    const base = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_PIN }])
    const r = transition(base.state, { type: 'USE_PASSWORD_FALLBACK' })
    expect(r.state.phase).toBe('fallback-login')
  })
})

describe('V4 — login password / signup', () => {
  it('LOGIN_PENDING muestra bridge sin auth; LOGIN_SUCCESS habilita navigate', () => {
    const pending = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_GUEST }, { type: 'LOGIN_PENDING' }])
    expect(pending.state.phase).toBe('bridging')
    expect(getOverlayMode(pending.state)).toBe('bridge')
    const opaque = transition(pending.state, { type: 'BRIDGE_OPAQUE' })
    // Sin LOGIN_SUCCESS todavía no navega (la red puede fallar)
    expect(opaque.effects.map((e) => e.kind)).not.toContain('confirm-session-and-navigate')
    const success = transition(opaque.state, { type: 'LOGIN_SUCCESS' })
    expect(success.effects.map((e) => e.kind)).toContain('confirm-session-and-navigate')
  })

  it('LOGIN_FAILED y EMAIL_CONFIRMATION_PENDING esconden el bridge y vuelven a guest', () => {
    const pending = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_GUEST }, { type: 'LOGIN_PENDING' }])
    for (const type of ['LOGIN_FAILED', 'EMAIL_CONFIRMATION_PENDING'] as const) {
      const r = transition(pending.state, { type })
      expect(r.state.phase).toBe('guest')
      expect(getOverlayMode(r.state)).toBe('hidden')
    }
  })

  it('guest sin sesión pero con creds biométricas → navigate login?autoBiometric=1', () => {
    const r = transition(
      transition(initialAuthFlowState, { type: 'BOOT' }).state,
      { type: 'PROBES_RESOLVED', probes: PROBES_GUEST_WITH_CREDS },
    )
    expect(r.effects).toEqual([{ kind: 'navigate', to: '/(auth)/login?autoBiometric=1' }])
  })

  it('sin lock configurado → bridging directo con mark-app-unlocked', () => {
    const r = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_NO_LOCK }])
    expect(r.state.phase).toBe('bridging')
    expect(r.effects).toContain('mark-app-unlocked')
    expect(r.effects).toContain('prefetch-snapshot')
  })
})

describe('V5 — re-lock', () => {
  function toReady() {
    return run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
      { type: 'BRIDGE_OPAQUE' },
      { type: 'NAVIGATED' },
      { type: 'MIN_HOLD_ELAPSED' },
      { type: 'DESTINATION_READY' },
      { type: 'REVEAL_DONE' },
    ]).state
  }

  it('RELOCK desde ready → probing con reset + navigate / + re-probes', () => {
    const r = transition(toReady(), { type: 'RELOCK', source: 'background' })
    expect(r.state.phase).toBe('probing')
    expect(r.effects.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['reset-app-lock', 'navigate', 'run-probes']),
    )
  })

  it('RELOCK fuera de ready es no-op (mid-bridge no se interrumpe)', () => {
    const mid = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
    ])
    const r = transition(mid.state, { type: 'RELOCK', source: 'inactivity' })
    expect(r.state).toEqual(mid.state)
    expect(r.effects).toEqual([])
  })
})

describe('errores del bridge', () => {
  function toBridgeNavigated() {
    return run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
      { type: 'BRIDGE_OPAQUE' },
      { type: 'NAVIGATED' },
    ]).state
  }

  it('LOAD_FAILED → bridge-error con overlay en modo error', () => {
    const r = transition(toBridgeNavigated(), { type: 'LOAD_FAILED', kind: 'network' })
    expect(r.state.phase).toBe('bridge-error')
    expect(getOverlayMode(r.state)).toEqual({ error: 'network' })
    expect(r.effects.map((e) => e.kind)).toContain('cancel-timers')
  })

  it('SAFETY_ELAPSED → bridge-error(timeout)', () => {
    const r = transition(toBridgeNavigated(), { type: 'SAFETY_ELAPSED' })
    expect(r.state).toMatchObject({ phase: 'bridge-error', kind: 'timeout' })
  })

  it('RETRY → vuelve a bridging (opaque, sin re-navegar) y re-prefetchea', () => {
    const err = transition(toBridgeNavigated(), { type: 'LOAD_FAILED', kind: 'network' })
    const r = transition(err.state, { type: 'RETRY' })
    expect(r.state).toMatchObject({ phase: 'bridging', opaque: true, navigated: true })
    expect(r.effects.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['prefetch-snapshot', 'schedule']),
    )
  })

  it('SESSION_RESTORE_FAILED → fallback-login', () => {
    const r = transition(toBridgeNavigated(), { type: 'SESSION_RESTORE_FAILED' })
    expect(r.state.phase).toBe('fallback-login')
    expect(r.effects).toEqual([{ kind: 'navigate', to: '/(auth)/login' }])
  })
})

describe('robustez — eventos fuera de estado son no-ops', () => {
  it.each([
    ['FACE_ID_OK en ready'],
    ['PIN_OK en guest'],
    ['BRIDGE_OPAQUE en locked'],
    ['DESTINATION_READY en probing'],
  ])('%s', (label) => {
    const cases: Record<string, [AuthFlowState, AuthFlowEvent]> = {
      'FACE_ID_OK en ready': [{ phase: 'ready' }, { type: 'FACE_ID_OK' }],
      'PIN_OK en guest': [{ phase: 'guest' }, { type: 'PIN_OK' }],
      'BRIDGE_OPAQUE en locked': [{ phase: 'locked', method: 'pin' }, { type: 'BRIDGE_OPAQUE' }],
      'DESTINATION_READY en probing': [{ phase: 'probing' }, { type: 'DESTINATION_READY' }],
    }
    const [state, event] = cases[label]!
    const r = transition(state, event)
    expect(r.state).toEqual(state)
    expect(r.effects).toEqual([])
  })

  it('double-fire de FACE_ID_OK en bridging es no-op', () => {
    const mid = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO },
      { type: 'FACE_ID_OK' },
    ])
    const r = transition(mid.state, { type: 'FACE_ID_OK' })
    expect(r.state).toEqual(mid.state)
  })
})
```

- [ ] **Step 2: Correr y verificar que FALLA**

Run: `npx vitest run tests/unit/auth-flow-machine.test.ts`
Expected: FAIL — "Cannot find module '@/features/auth-flow/auth-flow-machine'"

- [ ] **Step 3: Implementar la máquina completa**

```ts
// mobile/features/auth-flow/auth-flow-machine.ts
//
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

const FALLBACK_LOGIN: TransitionResult = {
  state: { phase: 'fallback-login' },
  effects: [{ kind: 'navigate', to: '/(auth)/login' }],
}

export function transition(state: AuthFlowState, event: AuthFlowEvent): TransitionResult {
  switch (event.type) {
    case 'BOOT':
      if (state.phase !== 'idle') return NOOP(state)
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
        effects: [{ kind: 'mark-app-unlocked' }, { kind: 'prefetch-snapshot' }, ...direct.effects],
      }
    }

    case 'FACE_ID_OK':
      if (state.phase !== 'locked' || state.method !== 'biometric') return NOOP(state)
      return enterBridging('unlock', { authed: true, haptic: true })

    case 'FACE_ID_FAIL':
      if (state.phase !== 'locked' || state.method !== 'biometric') return NOOP(state)
      return FALLBACK_LOGIN

    case 'PIN_OK':
      if (state.phase !== 'locked' || state.method !== 'pin') return NOOP(state)
      return enterBridging('unlock', { authed: true, haptic: true })

    case 'USE_PASSWORD_FALLBACK':
      if (state.phase !== 'locked') return NOOP(state)
      return FALLBACK_LOGIN

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

    case 'SESSION_RESTORE_FAILED':
      if (state.phase !== 'bridging') return NOOP(state)
      return {
        state: FALLBACK_LOGIN.state,
        effects: [{ kind: 'cancel-timers' }, ...FALLBACK_LOGIN.effects],
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
        state: { phase: 'bridge-error', journey: state.journey, kind: 'timeout', navigated: state.navigated },
        effects: [{ kind: 'cancel-timers' }],
      }

    case 'LOAD_FAILED':
      if (state.phase !== 'bridging') return NOOP(state)
      return {
        state: { phase: 'bridge-error', journey: state.journey, kind: event.kind, navigated: state.navigated },
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
        effects: [{ kind: 'prefetch-snapshot' }, { kind: 'schedule', timer: 'safety' }, ...advanced.effects],
      }
    }

    case 'REVEAL_DONE':
      if (state.phase !== 'revealing') return NOOP(state)
      return { state: { phase: 'ready' }, effects: [] }

    case 'RELOCK':
      if (state.phase !== 'ready') return NOOP(state)
      return {
        state: { phase: 'probing' },
        effects: [{ kind: 'reset-app-lock' }, { kind: 'navigate', to: '/' }, { kind: 'run-probes' }],
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
```

- [ ] **Step 4: Correr tests hasta verde**

Run: `npx vitest run tests/unit/auth-flow-machine.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add mobile/features/auth-flow/auth-flow-machine.ts tests/unit/auth-flow-machine.test.ts
git commit -m "feat(auth-flow): máquina de estados pura con tests de los 5 viajes"
```

---

### Task 3: resolveDestination (ruteo puro)

**Files:**
- Create: `mobile/features/auth-flow/resolve-destination.ts`
- Test: `tests/unit/resolve-destination.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { resolveDestination } from '@/features/auth-flow/resolve-destination'

describe('resolveDestination', () => {
  it('onboarding pendiente + setup biométrico no mostrado → biometric-setup', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: null, hasFamily: false, showBiometricSetup: true }),
    ).toBe('/(app)/biometric-setup')
  })
  it('onboarding pendiente → onboarding', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: null, hasFamily: false, showBiometricSetup: false }),
    ).toBe('/(app)/onboarding')
  })
  it('sin familia → join', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: '2026-01-01', hasFamily: false, showBiometricSetup: false }),
    ).toBe('/(auth)/join')
  })
  it('todo verde → home', () => {
    expect(
      resolveDestination({ onboardingCompletedAt: '2026-01-01', hasFamily: true, showBiometricSetup: false }),
    ).toBe('/(app)/(tabs)/home')
  })
})
```

- [ ] **Step 2: Verificar FAIL** — `npx vitest run tests/unit/resolve-destination.test.ts`

- [ ] **Step 3: Implementar**

```ts
// mobile/features/auth-flow/resolve-destination.ts
//
// Ruteo post-auth puro. Reemplaza la cascada de Redirects de
// AppEntryGate. El orden de precedencia replica el del gate viejo:
// biometric-setup → onboarding → join → home. `showBiometricSetup`
// llega ya computado por `shouldShowBiometricSetup` (adapter).

export interface ResolveDestinationInput {
  onboardingCompletedAt: string | null
  hasFamily: boolean
  showBiometricSetup: boolean
}

export function resolveDestination(input: ResolveDestinationInput): string {
  if (!input.onboardingCompletedAt) {
    if (input.showBiometricSetup) return '/(app)/biometric-setup'
    return '/(app)/onboarding'
  }
  if (!input.hasFamily) return '/(auth)/join'
  return '/(app)/(tabs)/home'
}
```

- [ ] **Step 4: PASS + commit**

```bash
npx vitest run tests/unit/resolve-destination.test.ts
git add mobile/features/auth-flow/resolve-destination.ts tests/unit/resolve-destination.test.ts
git commit -m "feat(auth-flow): resolveDestination puro (reemplaza cascada del gate)"
```

---

### Task 4: Driver (controller) con adapters inyectados

**Files:**
- Create: `mobile/features/auth-flow/auth-flow-controller.ts`
- Test: `tests/unit/auth-flow-controller.test.ts`

- [ ] **Step 1: Test que falla (driver con adapters fake + scheduler manual)**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureAuthFlow,
  dispatchAuthFlow,
  getAuthFlowState,
  resetAuthFlowForTesting,
  type AuthFlowAdapters,
} from '@/features/auth-flow/auth-flow-controller'

function makeAdapters(overrides: Partial<AuthFlowAdapters> = {}): AuthFlowAdapters {
  return {
    runProbes: vi.fn(async () => ({
      hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true,
    })),
    promptBiometric: vi.fn(async () => ({ success: true as const })),
    prefetchSnapshot: vi.fn(async () => {}),
    confirmSession: vi.fn(async () => 'ok' as const),
    resolveDestinationRoute: vi.fn(async () => '/(app)/(tabs)/home'),
    navigate: vi.fn(),
    haptic: vi.fn(),
    markAppUnlocked: vi.fn(),
    resetAppLock: vi.fn(),
    schedule: vi.fn(() => () => {}),
    log: vi.fn(),
    ...overrides,
  }
}

// flush de microtasks para que los efectos async del driver terminen
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('auth-flow-controller', () => {
  beforeEach(() => resetAuthFlowForTesting())

  it('V1: BOOT → probes → prompt+prefetch en paralelo → navigate solo tras BRIDGE_OPAQUE', async () => {
    const adapters = makeAdapters()
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    expect(adapters.prefetchSnapshot).toHaveBeenCalled()
    expect(adapters.promptBiometric).toHaveBeenCalled()
    // promptBiometric success → FACE_ID_OK auto-dispatch → bridging
    expect(getAuthFlowState().phase).toBe('bridging')
    expect(adapters.navigate).not.toHaveBeenCalled() // invariante 1
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(adapters.confirmSession).toHaveBeenCalled()
    expect(adapters.markAppUnlocked).toHaveBeenCalled()
    expect(adapters.navigate).toHaveBeenCalledWith('/(app)/(tabs)/home')
    // NAVIGATED auto-dispatch
    expect(getAuthFlowState()).toMatchObject({ phase: 'bridging', navigated: true })
  })

  it('V2: prompt cancel → fallback-login → navigate login', async () => {
    const adapters = makeAdapters({
      promptBiometric: vi.fn(async () => ({ success: false as const, error: 'user_cancel' })),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    expect(getAuthFlowState().phase).toBe('fallback-login')
    expect(adapters.navigate).toHaveBeenCalledWith('/(auth)/login')
  })

  it('sesión irrecuperable → SESSION_RESTORE_FAILED → login', async () => {
    const adapters = makeAdapters({
      confirmSession: vi.fn(async () => 'login-required' as const),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(getAuthFlowState().phase).toBe('fallback-login')
  })

  it('los timers agendados dispatchean su evento', async () => {
    const timerCallbacks: Record<string, () => void> = {}
    const adapters = makeAdapters({
      schedule: vi.fn((timer: string, _ms: number, cb: () => void) => {
        timerCallbacks[timer] = cb
        return () => delete timerCallbacks[timer]
      }),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    dispatchAuthFlow({ type: 'DESTINATION_READY' })
    timerCallbacks['min-hold']!()
    expect(getAuthFlowState().phase).toBe('revealing')
    timerCallbacks['reveal-done']!()
    expect(getAuthFlowState().phase).toBe('ready')
  })

  it('prefetch que rechaza dispatchea LOAD_FAILED(network)', async () => {
    const adapters = makeAdapters({
      prefetchSnapshot: vi.fn(async () => { throw new Error('fetch failed') }),
    })
    configureAuthFlow(adapters)
    dispatchAuthFlow({ type: 'BOOT' })
    await flush()
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
    await flush()
    expect(getAuthFlowState().phase).toBe('bridge-error')
  })
})
```

- [ ] **Step 2: Verificar FAIL** — `npx vitest run tests/unit/auth-flow-controller.test.ts`

- [ ] **Step 3: Implementar el driver**

```ts
// mobile/features/auth-flow/auth-flow-controller.ts
//
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
const listeners = new Set<() => void>()

export function configureAuthFlow(next: AuthFlowAdapters) {
  adapters = next
}

export function getAuthFlowState(): AuthFlowState {
  return state
}

export function subscribeAuthFlow(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetAuthFlowForTesting() {
  for (const cancel of cancelers.values()) cancel()
  cancelers.clear()
  state = initialAuthFlowState
  adapters = null
  prefetchPromise = null
}

export function dispatchAuthFlow(event: AuthFlowEvent) {
  if (!adapters) return
  const result = transition(state, event)
  const changed = result.state !== state
  state = result.state
  adapters.log(`${event.type} → ${state.phase}`, { effects: result.effects.map((e) => e.kind) })
  if (changed) for (const listener of listeners) listener()
  for (const effect of result.effects) execute(effect)
}

function execute(effect: AuthFlowEffect) {
  const a = adapters
  if (!a) return
  switch (effect.kind) {
    case 'run-probes':
      void a.runProbes().then(
        (probes) => dispatchAuthFlow({ type: 'PROBES_RESOLVED', probes }),
        () => dispatchAuthFlow({
          type: 'PROBES_RESOLVED',
          probes: { hasSession: false, shouldUseBiometric: false, pinSet: false, hasSavedCredentials: false },
        }),
      )
      return
    case 'prompt-biometric':
      void a.promptBiometric().then((result) => {
        if (result.success) dispatchAuthFlow({ type: 'FACE_ID_OK' })
        else dispatchAuthFlow({ type: 'FACE_ID_FAIL', reason: 'cancel' })
      })
      return
    case 'prefetch-snapshot':
      prefetchPromise = a.prefetchSnapshot().catch((error: unknown) => {
        // Solo es fatal si el bridge está esperando el destino; la
        // pantalla destino re-emite LOAD_FAILED via su propio error
        // handling. Acá reportamos para el caso prefetch-only.
        a.log('prefetch failed', { error: String(error) })
        throw error
      })
      // Evitar unhandled rejection cuando nadie espera el prefetch aún.
      prefetchPromise.catch(() => {})
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
      const cancel = a.schedule(effect.timer, TIMER_DURATIONS[effect.timer], () => {
        cancelers.delete(effect.timer)
        dispatchAuthFlow(TIMER_EVENTS[effect.timer])
      })
      cancelers.set(effect.timer, cancel)
      return
    }
    case 'cancel-timers':
      for (const cancel of cancelers.values()) cancel()
      cancelers.clear()
      return
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
npx vitest run tests/unit/auth-flow-controller.test.ts tests/unit/auth-flow-machine.test.ts
git add mobile/features/auth-flow/auth-flow-controller.ts tests/unit/auth-flow-controller.test.ts
git commit -m "feat(auth-flow): driver con adapters inyectados y timers cancelables"
```

---

### Task 5: Adapters reales

**Files:**
- Create: `mobile/features/auth-flow/auth-flow-adapters.ts`

- [ ] **Step 1: Implementar (sin test unitario — todo IO; se valida en Expo Go en Etapa 2)**

```ts
// mobile/features/auth-flow/auth-flow-adapters.ts
//
// Adapters REALES del driver. Reúnen el IO que antes vivía repartido
// en AppEntryGate / UnlockScreen / login controllers. El slow-path de
// restauración de sesión preserva la decisión documentada: NO borrar
// credenciales cuando el refresh token expiró (solo logout explícito).

import { router } from 'expo-router'
import { authFlowLog } from '@/lib/auth-flow-logger'
import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { triggerHaptic } from '@/lib/haptics'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricCredentials,
  getBiometricLoginState,
  updateStoredRefreshToken,
} from '@/lib/biometric-auth'
import { getPinLockState } from '@/lib/pin-lock'
import { markAppUnlocked, resetAppLock } from '@/features/auth/app-lock-state'
import { getBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'
import { prefetchHomeSnapshot } from '@/features/home/use-home-snapshot'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'
import { familyQueryKey, type FamilyInfo } from '@/features/family/use-family'
import { resolveDestination } from '@/features/auth-flow/resolve-destination'
import type { AuthFlowAdapters } from '@/features/auth-flow/auth-flow-controller'

async function getSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const realAuthFlowAdapters: AuthFlowAdapters = {
  async runProbes() {
    const [{ data }, bio, pin] = await Promise.all([
      supabase.auth.getSession(),
      getBiometricLoginState(),
      getPinLockState(),
    ])
    return {
      hasSession: Boolean(data.session),
      shouldUseBiometric: bio.isAvailable && bio.hasSavedCredentials,
      pinSet: pin.isSet,
      hasSavedCredentials: bio.hasSavedCredentials,
    }
  },

  async promptBiometric() {
    const result = await authenticateBiometricAccess({
      promptMessage: 'Desbloqueá Manifiesto',
      disableDeviceFallback: true,
    })
    return result.success ? { success: true } : { success: false, error: result.error }
  },

  async prefetchSnapshot() {
    const userId = await getSessionUserId()
    if (!userId) return
    await prefetchHomeSnapshot(queryClient, userId)
  },

  async confirmSession() {
    // FAST PATH (99%): sesión activa en el cliente.
    const { data } = await supabase.auth.getSession()
    if (data.session) return 'ok'
    // SLOW PATH: restaurar desde el refresh token del Keychain.
    const credentials = await getBiometricCredentials()
    if (!credentials) {
      // Keychain inconsistente: limpiar para que el login re-arme.
      await clearBiometricCredentials()
      return 'login-required'
    }
    const refresh = await supabase.auth.refreshSession({
      refresh_token: credentials.refreshToken,
    })
    if (refresh.error || !refresh.data.session) {
      // Token expirado/revocado: NO limpiar creds (decisión documentada).
      return 'login-required'
    }
    const nextToken = refresh.data.session.refresh_token
    if (nextToken && nextToken !== credentials.refreshToken) {
      await updateStoredRefreshToken(nextToken)
    }
    return 'ok'
  },

  async resolveDestinationRoute() {
    const userId = await getSessionUserId()
    if (!userId) return '/(auth)/welcome'
    // Los caches fueron sembrados por el prefetch del snapshot.
    const profile = queryClient.getQueryData<Profile | null>(profileQueryKey(userId)) ?? null
    const family = queryClient.getQueryData<FamilyInfo | null>(familyQueryKey(userId)) ?? null
    const onboardingCompletedAt = profile?.onboarding_completed_at ?? null
    let showBiometricSetup = false
    if (!onboardingCompletedAt) {
      const shown = await getBiometricSetupShown(userId)
      showBiometricSetup = shouldShowBiometricSetup({
        sessionUserId: userId,
        onboardingCompletedAt,
        biometricSetupShown: shown,
        biometricSetupFlagLoaded: true,
      })
    }
    return resolveDestination({
      onboardingCompletedAt,
      hasFamily: Boolean(family),
      showBiometricSetup,
    })
  },

  navigate(to) {
    router.replace(to as never)
  },

  haptic(feedback) {
    void triggerHaptic(feedback)
  },

  markAppUnlocked,
  resetAppLock,

  schedule(_timer, ms, cb) {
    const id = setTimeout(cb, ms)
    return () => clearTimeout(id)
  },

  log(message, extra) {
    authFlowLog('machine', message, extra)
  },
}
```

> Nota: verificar las firmas exactas de `shouldShowBiometricSetup` y
> `getBiometricSetupShown` en `mobile/features/auth/` al implementar —
> si difieren, adaptar la llamada manteniendo la semántica del gate viejo
> (`app-entry-gate.tsx` líneas 58-98 pre-borrado).

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint mobile/features/auth-flow/
git add mobile/features/auth-flow/auth-flow-adapters.ts
git commit -m "feat(auth-flow): adapters reales (probes, biometría, sesión, ruteo)"
```

---

### Task 6: Hook React + dev journeys en Settings

**Files:**
- Create: `mobile/features/auth-flow/use-auth-flow.ts`
- Create: `mobile/features/auth-flow/dev-journeys.ts`
- Modify: `mobile/screens/settings/settings-screen.tsx` (handlers ~727-754 y rows ~1301-1318)

- [ ] **Step 1: Hook de suscripción**

```ts
// mobile/features/auth-flow/use-auth-flow.ts
import { useSyncExternalStore } from 'react'
import {
  getAuthFlowState,
  subscribeAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'

export function useAuthFlowState() {
  return useSyncExternalStore(subscribeAuthFlow, getAuthFlowState, getAuthFlowState)
}
```

- [ ] **Step 2: Dev journeys (viajes sintéticos contra la máquina real)**

```ts
// mobile/features/auth-flow/dev-journeys.ts
//
// Viajes simulados para Settings → Desarrollo. Inyectan adapters fake
// (prompt biométrico y red simulados con delays reales del spec) y al
// terminar restauran los adapters reales. SOLO __DEV__.

import {
  configureAuthFlow,
  dispatchAuthFlow,
  resetAuthFlowForTesting,
  type AuthFlowAdapters,
} from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { triggerHaptic } from '@/lib/haptics'
import { authFlowLog } from '@/lib/auth-flow-logger'

export type DevJourney = 'faceid-success' | 'faceid-cancel' | 'network-error'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function runDevJourney(journey: DevJourney) {
  if (!__DEV__) return
  const fake: AuthFlowAdapters = {
    ...realAuthFlowAdapters,
    runProbes: async () => ({
      hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true,
    }),
    promptBiometric: async () => {
      await wait(2200) // tiempo típico de FaceID
      return journey === 'faceid-cancel' ? { success: false } : { success: true }
    },
    prefetchSnapshot: async () => {
      await wait(900)
      if (journey === 'network-error') throw new Error('simulated offline')
    },
    confirmSession: async () => 'ok',
    resolveDestinationRoute: async () => '/(app)/(tabs)/home',
    // En el simulado NO navegamos de verdad: el user está en Settings.
    navigate: (to) => authFlowLog('dev-journey', `navigate simulado → ${to}`),
    haptic: (f) => void triggerHaptic(f),
    markAppUnlocked: () => {},
    resetAppLock: () => {},
  }
  resetAuthFlowForTesting()
  configureAuthFlow(fake)
  dispatchAuthFlow({ type: 'BOOT' })
  // DESTINATION_READY simulado: en el flujo real lo emite el home.
  if (journey !== 'network-error') {
    void wait(2200 + 600).then(() => dispatchAuthFlow({ type: 'DESTINATION_READY' }))
  }
  // Al llegar a ready (o tras 25s de fallback), restaurar adapters reales.
  void wait(25_000).then(() => {
    resetAuthFlowForTesting()
    configureAuthFlow(realAuthFlowAdapters)
  })
}
```

> En la Etapa 2 el `TransitionOverlay` ya lee la máquina, así que estos
> viajes muestran el bridge real (fade-in, hold, soar-away o error con
> Reintentar). En la Etapa 1 el viaje solo se ve en los logs `[auth-flow]`
> — suficiente para validar la secuencia de estados.

- [ ] **Step 3: Reemplazar los dev handlers de settings**

En `settings-screen.tsx`, junto a `handlePreviewTransitionSplash` (línea ~727), agregar (sin borrar los viejos todavía — se borran en Etapa 5):

```ts
const handleDevJourney = useCallback((journey: DevJourney) => {
  void triggerHaptic('selection')
  runDevJourney(journey)
}, [])
```

con imports `import { runDevJourney, type DevJourney } from '@/features/auth-flow/dev-journeys'`, y en el grupo "Desarrollo" (línea ~1300) agregar tres `SettingsRow` ANTES de los existentes:

```tsx
<SettingsRow
  helper="Simula el viaje completo: probes → Face ID (2.2s) → bridge → soar-away."
  icon="play-circle-outline"
  label="Probar viaje · Face ID success"
  onPress={() => handleDevJourney('faceid-success')}
/>
<SettingsRow
  helper="Simula cancel del prompt → fallback a login (solo logs en Etapa 1)."
  icon="cancel"
  label="Probar viaje · Face ID cancel"
  onPress={() => handleDevJourney('faceid-cancel')}
/>
<SettingsRow
  helper="Simula snapshot fallido → bridge-error con Reintentar."
  icon="cloud-off"
  label="Probar viaje · error de red"
  onPress={() => handleDevJourney('network-error')}
/>
```

- [ ] **Step 4: Validar + commit**

```bash
npm run validate   # unit tests verdes (ignorar integración RLS sin supabase)
npx expo start     # en Expo Go: Settings → Desarrollo → Probar viaje · Face ID success
```
Expected en Metro logs: `[auth-flow] ... BOOT → probing`, `PROBES_RESOLVED → locked`, `FACE_ID_OK → bridging`, etc.

```bash
git add mobile/features/auth-flow/ mobile/screens/settings/settings-screen.tsx
git commit -m "feat(auth-flow): hook React + dev journeys en Settings (Etapa 1 completa)"
```

---

## ETAPA 2 — Overlay + BootScreen: V1/V2 reales

### Task 7: TransitionOverlay lee la máquina (shim dual-store)

**Files:**
- Modify: `mobile/components/root/root-layout-shell.tsx` (componente `TransitionOverlay`, líneas ~245-345)

- [ ] **Step 1: Reescribir TransitionOverlay**

Reemplazar el cuerpo de `TransitionOverlay` y su call site. El overlay pasa a recibir AMBAS fuentes (store viejo para login/signup hasta Etapa 3, máquina para boot):

```tsx
function TransitionOverlay({ visible, phase, errorKind }: TransitionOverlayProps) {
  // [conservar el comment block ALWAYS-MOUNTED existente]
  const machine = useAuthFlowState()
  const machineMode = getOverlayMode(machine)

  // Shim de coexistencia (se borra en Etapa 5): visible si el store
  // viejo (login/signup) O la máquina (boot/unlock) lo piden.
  const machineVisible = machineMode !== 'hidden'
  const effectiveVisible = visible || machineVisible
  const isRevealing = machineMode === 'revealing'
  const machineError = typeof machineMode === 'object' ? machineMode.error : undefined
  const effectivePhase: AuthTransitionPhase = machineVisible
    ? (machineError ? 'error' : 'showing')
    : phase
  const effectiveErrorKind = machineError ?? errorKind

  const opacity = useSharedValue(effectiveVisible ? 1 : 0)
  const scale = useSharedValue(effectiveVisible ? 1 : BRIDGE_SCALE_FROM)
  const translateY = useSharedValue(0)

  const reportOpaque = useCallback(() => {
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
  }, [])

  const prevKeyRef = useRef<string | null>(null)
  useEffect(() => {
    // key = qué animación corresponde. Cambios de fase sin cambio de
    // key no re-animan (regla heredada del fix 27af905).
    const key = isRevealing ? 'soar' : effectiveVisible ? 'in' : 'out'
    if (prevKeyRef.current === key) return
    const isFirst = prevKeyRef.current === null
    prevKeyRef.current = key
    if (isFirst && key === 'out') return // mount ya escondido
    if (key === 'in') {
      const config = { duration: BRIDGE_FADE_IN_MS, easing: EASE_OUT_STRONG }
      translateY.value = withTiming(0, config)
      scale.value = withTiming(1, config)
      // INVARIANTE 1: BRIDGE_OPAQUE se emite desde el callback del
      // fade-in — la navegación ocurre SOLO con el overlay opaco.
      opacity.value = withTiming(1, config, (finished) => {
        if (finished) runOnJS(reportOpaque)()
      })
    } else {
      // 'soar' y 'out' comparten la salida soar-away (550ms).
      const config = { duration: SOAR_AWAY_MS, easing: EASE_OUT_SOFT }
      opacity.value = withTiming(0, config)
      scale.value = withTiming(SOAR_SCALE_TO, config)
      translateY.value = withTiming(SOAR_TRANSLATE_Y, config)
    }
  }, [effectiveVisible, isRevealing, opacity, scale, translateY, reportOpaque])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  if (Platform.OS === 'web' && !effectiveVisible) return null

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlayShell, overlayStyle]}
      pointerEvents={effectiveVisible ? 'auto' : 'none'}
    >
      <AuthTransitionSplash phase={effectivePhase} errorKind={effectiveErrorKind} />
    </Animated.View>
  )
}
```

Imports nuevos en el archivo: `runOnJS` (de reanimated), `useRef`, `useAuthFlowState`, `getOverlayMode`, `dispatchAuthFlow`, y los tokens `BRIDGE_FADE_IN_MS, SOAR_AWAY_MS, BRIDGE_SCALE_FROM, SOAR_SCALE_TO, SOAR_TRANSLATE_Y` desde `auth-flow-motion` (borrar las constantes locales `FADE_IN_MS/FADE_OUT_MS/SCALE_FROM/SCALE_EXIT_TO/TRANSLATE_Y_EXIT` y usar los tokens; conservar `EASE_OUT_STRONG`/`EASE_OUT_SOFT`).

El error fallback del splash (`AuthTransitionSplash → ErrorFallback`) llama `hideAuthTransitionSplash`/`showAuthTransitionError` del store viejo; agregar en su `handleRetry` el dispatch nuevo cuando la máquina está en error:

```ts
// en auth-transition-splash.tsx ErrorFallback.handleRetry, rama online:
import { dispatchAuthFlow, getAuthFlowState } from '@/features/auth-flow/auth-flow-controller'
// ...
if (online) {
  if (getAuthFlowState().phase === 'bridge-error') {
    dispatchAuthFlow({ type: 'RETRY' })
  } else {
    hideAuthTransitionSplash()
  }
}
```

- [ ] **Step 2: Validar dev journey con visuales**

Run: `npx expo start` → Settings → "Probar viaje · Face ID success".
Expected: bridge fade-in → hold ~1.2s → soar-away (sobre settings). "error de red" muestra el fallback con Reintentar.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/root/root-layout-shell.tsx mobile/components/auth/auth-transition-splash.tsx
git commit -m "feat(auth-flow): TransitionOverlay lee la máquina + BRIDGE_OPAQUE desde el callback del fade-in"
```

---

### Task 8: Emisores de DESTINATION_READY

**Files:**
- Create: `mobile/features/auth-flow/use-signal-destination-ready.ts`
- Modify: `mobile/screens/home/home-screen.tsx:73-77`
- Modify: `app/(app)/onboarding.tsx`, `app/(auth)/join.tsx`, `app/(app)/biometric-setup.tsx` (componente raíz de cada screen)

- [ ] **Step 1: Hook emisor**

```ts
// mobile/features/auth-flow/use-signal-destination-ready.ts
import { useEffect } from 'react'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'

/**
 * Señala a la máquina que el destino está listo para ser revelado.
 * `ready=true` por default (destinos que están listos al montar:
 * onboarding, join, biometric-setup). El home pasa `Boolean(snapshot.data)`.
 */
export function useSignalDestinationReady(ready: boolean = true) {
  useEffect(() => {
    if (ready) dispatchAuthFlow({ type: 'DESTINATION_READY' })
  }, [ready])
}
```

- [ ] **Step 2: Cablear emisores**

En `home-screen.tsx` reemplazar el bloque `markDestinationReady` (líneas 73-77) por:

```ts
useSignalDestinationReady(Boolean(snapshot.data))
```

(conservar el import de `markDestinationReady` y agregar UNA línea `markDestinationReady()` dentro del hook viejo NO — al revés: dejar el efecto viejo intacto y AGREGAR el hook nuevo al lado; el viejo se borra en Etapa 5 junto con su store. Ambos coexisten sin conflicto.)

En las pantallas de `onboarding`, `join` y `biometric-setup`: agregar `useSignalDestinationReady()` en el componente de pantalla (no en el route file si este solo re-exporta — ubicar el screen component real con grep).

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add mobile/features/auth-flow/use-signal-destination-ready.ts mobile/screens/home/home-screen.tsx app/
git commit -m "feat(auth-flow): emisores de DESTINATION_READY en home/onboarding/join/biometric-setup"
```

---

### Task 9: BootScreen + index.tsx (reemplaza AppEntryGate y /unlock)

**Files:**
- Create: `mobile/screens/boot/boot-screen.tsx`
- Modify: `app/index.tsx`
- Modify: `app/(auth)/unlock.tsx` (redirige a `/` — la ruta muere de verdad en Etapa 5)
- Modify: `mobile/components/root/root-layout-shell.tsx` (configurar adapters al boot)

- [ ] **Step 1: BootScreen**

```tsx
// mobile/screens/boot/boot-screen.tsx
//
// Superficie ÚNICA del arranque. Renderiza según la fase de la máquina:
//   probing / locked:biometric / bridging → fern + wordmark (idéntico al
//     bridge, centro REAL de pantalla, sin insets — invariante 4)
//   locked:pin → PinLockPanel (Etapa 4; hasta entonces la máquina no
//     emite locked:pin porque el gate viejo sigue ruteando PIN)
//   guest / fallback-login → fern (la navegación ya está en vuelo)
//
// El BOOT se dispatchea en un effect de mount. El prompt biométrico y
// el prefetch los dispara el DRIVER (efectos de la máquina) — esta
// pantalla no tiene lógica de auth.

import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { configureAuthFlow, dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { resetAuthFlowTimer } from '@/lib/auth-flow-logger'
import { authTokens } from '@/theme/palette'

export function BootScreen() {
  const state = useAuthFlowState()
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    resetAuthFlowTimer()
    configureAuthFlow(realAuthFlowAdapters)
    dispatchAuthFlow({ type: 'BOOT' })
  }, [])

  // Etapa 4 agrega: if (state.phase === 'locked' && state.method === 'pin') return <PinLockPanel />
  void state

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(400)}>
          <WarmFernLogo size={180} />
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: authTokens.welcomeBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
```

- [ ] **Step 2: Swap del index + neutralizar /unlock**

`app/index.tsx`:

```tsx
import { BootScreen } from '@/screens/boot/boot-screen'

export default function IndexRoute() {
  return <BootScreen />
}
```

`app/(auth)/unlock.tsx` (cualquier path viejo que navegue acá rebota al boot):

```tsx
import { Redirect } from 'expo-router'

export default function UnlockRoute() {
  return <Redirect href="/" />
}
```

> ATENCIÓN — re-entrada al boot: `BOOT` es no-op si la máquina no está
> en `idle`, y `RELOCK` ya setea `probing` + `run-probes` por su cuenta.
> El `bootedRef` evita re-dispatch en re-renders; el remount del index
> tras un re-lock NO debe re-disparar BOOT (la máquina ya está en
> probing) — el no-op de la máquina lo garantiza incluso si bootedRef
> es fresco en el nuevo mount.

- [ ] **Step 3: Validación manual V1/V2 en Expo Go (checklist)**

Con sesión guardada + Face ID:
1. Kill app → abrir → cold start animation completa SIN tapado → prompt Face ID ~0.5s → autenticar → bridge → soar-away → home. Logs: `BOOT → probing → locked → bridging (BRIDGE_OPAQUE → NAVIGATED) → revealing → ready`.
2. Kill app → abrir → CANCELAR el prompt → login screen actual con fade. Logs: `FACE_ID_FAIL → fallback-login`.
3. Sin tocar login (V4 sigue en el sistema viejo): login con password debe seguir funcionando igual que antes (store viejo + shim del overlay).

- [ ] **Step 4: Commit**

```bash
npm run validate && npx tsc --noEmit
git add mobile/screens/boot/ app/index.tsx "app/(auth)/unlock.tsx" mobile/components/root/root-layout-shell.tsx
git commit -m "feat(auth-flow): BootScreen reemplaza AppEntryGate/unlock — V1/V2 sobre la máquina"
```

> NOTA: `app-entry-gate.tsx` y `unlock-screen.tsx` quedan sin referencias
> pero NO se borran hasta la Etapa 5 (rollback fácil si la validación
> manual encuentra un edge).

---

## ETAPA 3 — V4: login / signup / OAuth sobre la máquina

### Task 10: use-login-submit emite eventos

**Files:**
- Modify: `mobile/features/auth/use-login-submit.ts` (~líneas 150-210)

- [ ] **Step 1: Reemplazar llamadas al store viejo**

- `showAuthTransitionSplash({ requireDestination: true })` → `dispatchAuthFlow({ type: 'LOGIN_PENDING' })`
- `markAuthSuccess()` (post `passwordSignIn`) → `dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })`
- En la rama email-confirmation: `hideAuthTransitionSplash()` → `dispatchAuthFlow({ type: 'EMAIL_CONFIRMATION_PENDING' })`
- En el catch / ramas de error: `hideAuthTransitionSplash()` → `dispatchAuthFlow({ type: 'LOGIN_FAILED' })`
- Signup con sesión inmediata (resolution type navega a onboarding): `dispatchAuthFlow({ type: 'SIGNUP_SUCCESS' })` en lugar del path viejo.
- Borrar el `router.replace` directo del submit si existe — la navegación la hace el driver (`confirm-session-and-navigate` → `resolveDestinationRoute` ya rutea onboarding/join/home).

Import: `import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'` (remover imports del store viejo que queden sin uso).

- [ ] **Step 2: Igual cirugía en `use-login-controller.ts`** — localizar con `grep -n "AuthTransitionSplash\|markAuthSuccess\|markDestinationReady" mobile/features/auth/use-login-controller.ts` y mapear cada llamada con la misma tabla del Step 1.

- [ ] **Step 3: Validación manual:** logout → login con password → bridge → home. Email sin confirmar → mensaje en form, sin splash colgado.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/auth/use-login-submit.ts mobile/features/auth/use-login-controller.ts
git commit -m "refactor(auth): login submit emite eventos de la máquina (V4 password)"
```

---

### Task 11: use-auth-biometric-controller + OAuth callback

**Files:**
- Modify: `mobile/features/auth/use-auth-biometric-controller.ts` (~líneas 140-250)
- Modify: `mobile/screens/auth/auth-callback-screen.tsx`

- [ ] **Step 1: Biometric-desde-login**

En `handleBiometricSignIn`:
- `showAuthTransitionSplash({ requireDestination: true })` → `dispatchAuthFlow({ type: 'LOGIN_PENDING' })`
- Cancel/fail: `hideAuthTransitionSplash()` → `dispatchAuthFlow({ type: 'LOGIN_FAILED' })` (conservar feedback haptics/mensajes)
- `markAuthSuccess()` → (borrar; el success se emite al final)
- Tras `onSignedIn()` exitoso: `dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })`
- Catch (refresh expirado): `hideAuthTransitionSplash()` → `dispatchAuthFlow({ type: 'LOGIN_FAILED' })` (mensaje actual intacto; creds NO se borran)

- [ ] **Step 2: OAuth callback** — en `auth-callback-screen.tsx`, donde hoy marca éxito/navega, emitir `dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })` y dejar que el driver navegue (borrar replace directo).

- [ ] **Step 3: Validación manual:** desde login → "Entrar con Face ID" → bridge → home. Cancel → queda en login con el mensaje.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/auth/use-auth-biometric-controller.ts mobile/screens/auth/auth-callback-screen.tsx
git commit -m "refactor(auth): biometric-desde-login y OAuth emiten eventos de la máquina"
```

---

## ETAPA 4 — V3 PIN + V5 re-lock

### Task 12: PinLockPanel embebido en Boot

**Files:**
- Create: `mobile/components/auth/pin-lock-panel.tsx` (extraído de `pin-unlock-screen.tsx`)
- Modify: `mobile/screens/boot/boot-screen.tsx`
- Modify: `app/(auth)/pin-unlock.tsx` (→ `<Redirect href="/" />`, ruta muere en Etapa 5)

- [ ] **Step 1: Extraer el panel**

Copiar `pin-unlock-screen.tsx` a `pin-lock-panel.tsx` con estos cambios EXACTOS (todo lo demás intacto: `useScreenCaptureProtection`, lockout, pinLength gate, estilos):

```tsx
// Reemplazos dentro del componente renombrado a PinLockPanel:
//  - eliminar useAuthSession/sessionQuery y el <Redirect> (la máquina ya
//    verificó la sesión en probing — solo se llega acá con sesión válida)
//  - success:  markAppUnlocked() + router.replace('/')
//    →          dispatchAuthFlow({ type: 'PIN_OK' })
//  - handleForgot: router.replace('/(auth)/login')
//    →          dispatchAuthFlow({ type: 'USE_PASSWORD_FALLBACK' })
//  - quitar imports useRouter / markAppUnlocked / Redirect
```

- [ ] **Step 2: Boot renderiza el panel**

En `boot-screen.tsx` reemplazar `void state` por:

```tsx
if (state.phase === 'locked' && state.method === 'pin') {
  return <PinLockPanel />
}
```

- [ ] **Step 3: Validación manual:** desactivar Face ID (Settings) y activar PIN → kill app → abrir → pad de PIN → PIN correcto → **bridge premium** → home (nuevo comportamiento). "Olvidé mi PIN" → login.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/auth/pin-lock-panel.tsx mobile/screens/boot/boot-screen.tsx "app/(auth)/pin-unlock.tsx"
git commit -m "feat(auth-flow): PIN unlock embebido en boot con transición premium (V3)"
```

---

### Task 13: Watchers de re-lock emiten RELOCK

**Files:**
- Modify: `mobile/components/root/background-relock-watcher.tsx:46-52`
- Modify: `mobile/components/root/inactivity-relock-watcher.tsx:60-66`
- Modify: `mobile/components/root/notification-router-bridge.tsx` (gate en ready)

- [ ] **Step 1: background watcher** — reemplazar:

```ts
if (relock) {
  resetAppLock()
  router.replace('/')
}
```
por:
```ts
if (relock) {
  // La máquina ejecuta reset-app-lock + navigate('/') + run-probes.
  dispatchAuthFlow({ type: 'RELOCK', source: 'background' })
}
```
(El check de grace window sigue en `shouldRelock` — pure fn ya testeada.)
Quitar imports `resetAppLock`/`router` si quedan sin uso.

- [ ] **Step 2: inactivity watcher** — mismo reemplazo con `source: 'inactivity'`.

- [ ] **Step 3: NotificationRouterBridge** — gatear el flush de rutas pendientes con la máquina: donde el bridge decide rutear, agregar guard

```ts
const { phase } = useAuthFlowState()
// solo rutear deep links con el viaje terminado
if (phase !== 'ready') return
```
(adaptar a la estructura real del archivo — leerlo primero; si usa un effect con deps, agregar `phase` a las deps y el early-return arriba).

- [ ] **Step 4: Validación manual:** abrir app → home → background >60s → volver: fern lock + Face ID re-prompt → bridge → home. Logs: `RELOCK → probing`.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/root/background-relock-watcher.tsx mobile/components/root/inactivity-relock-watcher.tsx mobile/components/root/notification-router-bridge.tsx
git commit -m "refactor(auth): watchers de re-lock y deep links sobre la máquina (V5)"
```

---

## ETAPA 5 — Demolición + docs

### Task 14: Borrar el sistema viejo

**Files:**
- Delete: `mobile/components/root/app-entry-gate.tsx`, `mobile/screens/auth/unlock-screen.tsx`, `mobile/screens/auth/pin-unlock-screen.tsx`, `app/(auth)/unlock.tsx`, `app/(auth)/pin-unlock.tsx`, `mobile/lib/auth-transition-splash.ts`, `mobile/lib/auth-transition-dismiss-gate.ts`
- Modify: `mobile/components/guards.tsx`, `mobile/components/root/app-stack-shell.tsx`, `mobile/components/root/global-connectivity-watcher.tsx`, `mobile/components/root/root-layout-shell.tsx`, `mobile/screens/home/home-screen.tsx`, `mobile/screens/settings/settings-screen.tsx`, `app/(auth)/_layout.tsx`

- [ ] **Step 1: Sweep de referencias al store viejo**

Run: `grep -rln "auth-transition-splash\|markAuthSuccess\|markDestinationReady\|markAuthTransitionLoaded\|showAuthTransitionSplash" mobile/ app/`
Para cada archivo:
- `guards.tsx`: borrar los `useEffect` de `markAuthTransitionLoaded` y sus imports (el resto del bouncer queda).
- `app-stack-shell.tsx`: el error-bridge (`reportAuthTransitionError`) pasa a `dispatchAuthFlow({ type: 'LOAD_FAILED', kind })`; el dismiss-gate effect se borra entero.
- `global-connectivity-watcher.tsx`: `showAuthTransitionError('network')` → `dispatchAuthFlow({ type: 'LOAD_FAILED', kind: 'network' })` (la máquina lo ignora salvo en bridging — comportamiento más correcto que el takeover global viejo; validar que la UX offline general no dependía de esto, si dependía, conservar el watcher con el store... NO: conservarlo emitiendo el evento y documentar).
- `home-screen.tsx`: borrar el efecto viejo `markDestinationReady` (queda solo `useSignalDestinationReady`).
- `settings-screen.tsx`: borrar los 3 handlers/rows viejos de "Probar splash" (quedan los "Probar viaje").
- `root-layout-shell.tsx`: borrar el shim dual-store del overlay (queda solo la máquina) y el import del store viejo.
- `(auth)/_layout.tsx`: borrar los `<Stack.Screen name="unlock">` / `"pin-unlock"`.
- Borrar los archivos listados en Delete + sus rutas.

- [ ] **Step 2: Validar TODO**

```bash
npx tsc --noEmit && npx eslint mobile/ app/ && npm run validate
npx expo export --platform ios   # regla del repo: bundle check antes de declarar verified
```
Expected: typecheck/lint verdes, unit tests verdes, bundle OK.

- [ ] **Step 3: Re-validación manual completa (los 5 viajes)**

V1 success / V2 cancel / V3 PIN / V4 password+biometric-desde-login+signup / V5 background re-lock — checklist de las etapas 2-4 repetido end-to-end.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(auth)!: demolición del sistema viejo — la máquina es la única orquestación"
```

---

### Task 15: Docs en sync + cierre

**Files:**
- Modify: `docs/sistemas/app-lock-model.md` (sección de arquitectura: AppEntryGate → auth-flow machine)
- Modify: `docs/superpowers/specs/2026-06-11-auth-flow-refactor-design.md` (estado → IMPLEMENTADO)
- Create: `docs/sistemas/auth-flow.md` (doc canónico nuevo: estados, eventos, invariantes, cómo ajustar timings, cómo correr los dev journeys)

- [ ] **Step 1: Escribir `docs/sistemas/auth-flow.md`** — contenido: diagrama de estados (texto), tabla de eventos/emisores, las 6 invariantes, tabla de tokens (`auth-flow-motion.ts`), guía "para cambiar el feel tocá X", referencia a la demo HTML y a los dev journeys.

- [ ] **Step 2: Actualizar `app-lock-model.md`** — reemplazar referencias a AppEntryGate/unlock-screen por boot-screen/máquina; el grace window y thresholds quedan igual.

- [ ] **Step 3: Commit final**

```bash
git add docs/
git commit -m "docs(auth): auth-flow.md canónico + app-lock-model en sync con la máquina"
```

---

## Self-review (ya aplicado)

- **Cobertura del spec:** invariantes 1-6 → Tasks 2/7/9; V1-V5 → Tasks 2/9/10/11/12/13; errores/retry/timeout → Tasks 2/4/7; dev journeys → Task 6; staging Expo Go → checklists en 6/9/10/11/12/13/14; docs → Task 15.
- **Riesgo conocido:** firmas de `shouldShowBiometricSetup`/`getBiometricSetupShown` y estructura interna de `use-login-controller`/`notification-router-bridge`/`auth-callback-screen` se verifican al implementar (los Tasks lo indican); la semántica a preservar está citada.
- **Consistencia de tipos:** `AuthFlowEvent`/`AuthFlowEffect`/`AuthFlowAdapters` definidos en Tasks 2/4 y usados idénticos en 5-13.
