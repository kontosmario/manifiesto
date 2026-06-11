import { describe, expect, it } from 'vitest'
import {
  initialAuthFlowState,
  transition,
  getOverlayMode,
  type AuthFlowEvent,
  type AuthFlowState,
} from '@/features/auth-flow/auth-flow-machine'

const PROBES_LOCKED_BIO = {
  hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true, isUnlocked: false,
}
const PROBES_LOCKED_PIN = {
  hasSession: true, shouldUseBiometric: false, pinSet: true, hasSavedCredentials: false, isUnlocked: false,
}
const PROBES_NO_LOCK = {
  hasSession: true, shouldUseBiometric: false, pinSet: false, hasSavedCredentials: false, isUnlocked: false,
}
const PROBES_GUEST = {
  hasSession: false, shouldUseBiometric: false, pinSet: false, hasSavedCredentials: false, isUnlocked: false,
}
const PROBES_GUEST_WITH_CREDS = {
  hasSession: false, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true, isUnlocked: false,
}
const PROBES_ALREADY_UNLOCKED = {
  hasSession: true, shouldUseBiometric: true, pinSet: false, hasSavedCredentials: true, isUnlocked: true,
}

/** Aplica eventos en secuencia, devolviendo estado final + todos los efectos. */
function run(events: AuthFlowEvent[], from: AuthFlowState = initialAuthFlowState) {
  let state = from
  const effects: string[] = []
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
    const pending = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_GUEST },
      { type: 'LOGIN_PENDING' },
    ])
    expect(pending.state.phase).toBe('bridging')
    expect(getOverlayMode(pending.state)).toBe('bridge')
    const opaque = transition(pending.state, { type: 'BRIDGE_OPAQUE' })
    // Sin LOGIN_SUCCESS todavía no navega (la red puede fallar)
    expect(opaque.effects.map((e) => e.kind)).not.toContain('confirm-session-and-navigate')
    const success = transition(opaque.state, { type: 'LOGIN_SUCCESS' })
    expect(success.effects.map((e) => e.kind)).toContain('confirm-session-and-navigate')
  })

  it('LOGIN_FAILED y EMAIL_CONFIRMATION_PENDING esconden el bridge y vuelven a guest', () => {
    const pending = run([
      { type: 'BOOT' },
      { type: 'PROBES_RESOLVED', probes: PROBES_GUEST },
      { type: 'LOGIN_PENDING' },
    ])
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

  it('ya desbloqueado (post-login con password) → bridging directo SIN re-prompt', () => {
    const r = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_ALREADY_UNLOCKED }])
    expect(r.state.phase).toBe('bridging')
    expect(r.effects).not.toContain('prompt-biometric')
    // No extiende el grace window del re-lock
    expect(r.effects).not.toContain('mark-app-unlocked')
  })

  it('BOOT es re-ejecutable desde guest/ready, no-op mid-journey', () => {
    const guest = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_GUEST }])
    const reboot = transition(guest.state, { type: 'BOOT' })
    expect(reboot.state.phase).toBe('probing')
    const locked = run([{ type: 'BOOT' }, { type: 'PROBES_RESOLVED', probes: PROBES_LOCKED_BIO }])
    const noop = transition(locked.state, { type: 'BOOT' })
    expect(noop.state).toEqual(locked.state)
    expect(noop.effects).toEqual([])
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
    expect(r.effects.map((e) => e.kind)).toContain('navigate')
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
