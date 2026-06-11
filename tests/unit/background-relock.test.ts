import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'
import { LOCK_THRESHOLDS } from '@/features/auth/lock-thresholds'

describe('shouldRelock', () => {
  const base = { thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS, isUnlocked: true }

  it('no re-bloquea si nunca salió de active (leftActiveAt null)', () => {
    expect(shouldRelock({ ...base, leftActiveAt: null, now: 1_000_000 })).toBe(false)
  })

  it('no re-bloquea bajo el umbral', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 30_000 }),
    ).toBe(false)
  })

  it('re-bloquea en o sobre el umbral', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({
        ...base,
        leftActiveAt,
        now: leftActiveAt + BACKGROUND_RELOCK_THRESHOLD_MS,
      }),
    ).toBe(true)
    expect(
      shouldRelock({
        ...base,
        leftActiveAt,
        now: leftActiveAt + BACKGROUND_RELOCK_THRESHOLD_MS * 2,
      }),
    ).toBe(true)
  })

  it('no re-bloquea si la app ya está locked', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({
        ...base,
        isUnlocked: false,
        leftActiveAt,
        now: leftActiveAt + BACKGROUND_RELOCK_THRESHOLD_MS * 2,
      }),
    ).toBe(false)
  })

  // Sprint R-1 (2026-06-10): el umbral default subió de 60s a 5min.
  // Single source of truth en lock-thresholds.ts.
  it('el umbral default es 5min y coincide con LOCK_THRESHOLDS.background', () => {
    expect(BACKGROUND_RELOCK_THRESHOLD_MS).toBe(5 * 60 * 1000)
    expect(BACKGROUND_RELOCK_THRESHOLD_MS).toBe(LOCK_THRESHOLDS.background)
  })

  // Sprint M · Audit #7 L-2 / 7-T7 (2026-06-14)
  it('re-bloquea si el delta es negativo (clock backwards manipulation)', () => {
    // leftActiveAt > now → delta negativo → forzar re-lock
    const leftActiveAt = 2_000_000
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt - 10_000 }),
    ).toBe(true)
  })
})
