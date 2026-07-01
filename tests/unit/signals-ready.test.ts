import { describe, expect, it } from 'vitest'
import {
  areSignalsReady,
  type SignalsReadyInput,
} from '@/features/insights/signals-ready'

function ready(overrides: Partial<SignalsReadyInput> = {}): SignalsReadyInput {
  return {
    hasUserId: true,
    blocklistLoaded: true,
    dismissalsHydrated: true,
    coreLoading: false,
    prefsLoading: false,
    statsLoading: false,
    snapshotLoading: false,
    homeSnapshotLoading: false,
    ...overrides,
  }
}

describe('areSignalsReady', () => {
  it('true cuando los filtros y todas las fuentes cargaron', () => {
    expect(areSignalsReady(ready())).toBe(true)
  })

  it('false hasta que la blocklist cargue (con userId)', () => {
    expect(areSignalsReady(ready({ blocklistLoaded: false }))).toBe(false)
  })

  it('sin userId la blocklist per-usuario no aplica (no bloquea)', () => {
    expect(
      areSignalsReady(ready({ hasUserId: false, blocklistLoaded: false })),
    ).toBe(true)
  })

  it('false hasta que los dismissals se hidraten', () => {
    expect(areSignalsReady(ready({ dismissalsHydrated: false }))).toBe(false)
  })

  // El fix: NO exponer señales mientras alguna fuente que las ALIMENTA todavía
  // carga → evita falsos positivos que aparecen con data parcial y luego se
  // esconden (cards, conteo y push). Cada fuente tardía debe bloquear.
  it.each([
    ['core + intelligence', { coreLoading: true }],
    ['advisor prefs (kill-switch)', { prefsLoading: true }],
    ['interaction stats (persona/cadencia)', { statsLoading: true }],
    ['control snapshot (forecast)', { snapshotLoading: true }],
    ['home snapshot (subscription check-in)', { homeSnapshotLoading: true }],
  ] as const)('false mientras carga una fuente de señales (%s)', (_label, override) => {
    expect(areSignalsReady(ready(override))).toBe(false)
  })
})
