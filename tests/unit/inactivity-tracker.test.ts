import { describe, expect, it } from 'vitest'
import {
  INACTIVITY_THRESHOLD_MS,
  shouldLockForInactivity,
} from '@/features/auth/inactivity-tracker'
import { LOCK_THRESHOLDS } from '@/features/auth/lock-thresholds'

// Sprint R-2 (2026-06-10) — pure decision tests for the foreground
// inactivity tracker. Keeps the logic side-by-side with the
// background-relock tests (background-relock.test.ts) so the lock
// rationale stays auditable in one place.

describe('shouldLockForInactivity', () => {
  const base = {
    thresholdMs: INACTIVITY_THRESHOLD_MS,
    isUnlocked: true,
    appState: 'active' as const,
  }

  it('no re-bloquea si la app no está active (background)', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        appState: 'background',
        lastInteractionAt,
        now: lastInteractionAt + INACTIVITY_THRESHOLD_MS * 2,
      }),
    ).toBe(false)
  })

  it('no re-bloquea si la app no está active (inactive)', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        appState: 'inactive',
        lastInteractionAt,
        now: lastInteractionAt + INACTIVITY_THRESHOLD_MS * 2,
      }),
    ).toBe(false)
  })

  it('no re-bloquea si la app ya está locked', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        isUnlocked: false,
        lastInteractionAt,
        now: lastInteractionAt + INACTIVITY_THRESHOLD_MS * 2,
      }),
    ).toBe(false)
  })

  it('no re-bloquea bajo el umbral', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        lastInteractionAt,
        now: lastInteractionAt + 30_000,
      }),
    ).toBe(false)
  })

  it('re-bloquea en o sobre el umbral', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        lastInteractionAt,
        now: lastInteractionAt + INACTIVITY_THRESHOLD_MS,
      }),
    ).toBe(true)
    expect(
      shouldLockForInactivity({
        ...base,
        lastInteractionAt,
        now: lastInteractionAt + INACTIVITY_THRESHOLD_MS * 2,
      }),
    ).toBe(true)
  })

  // Mirrors background-relock's M-L-2: clock manipulation → force lock.
  it('re-bloquea si el delta es negativo (clock backwards manipulation)', () => {
    const lastInteractionAt = 2_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        lastInteractionAt,
        now: lastInteractionAt - 10_000,
      }),
    ).toBe(true)
  })

  it('no re-bloquea si el delta es exactamente 0 (acaba de interactuar)', () => {
    const lastInteractionAt = 1_000_000
    expect(
      shouldLockForInactivity({
        ...base,
        lastInteractionAt,
        now: lastInteractionAt,
      }),
    ).toBe(false)
  })

  // Sprint R-2 (2026-06-10): canonical threshold lives en LOCK_THRESHOLDS.
  it('el umbral default es 15min y coincide con LOCK_THRESHOLDS.inactivity', () => {
    expect(INACTIVITY_THRESHOLD_MS).toBe(15 * 60 * 1000)
    expect(INACTIVITY_THRESHOLD_MS).toBe(LOCK_THRESHOLDS.inactivity)
  })
})
