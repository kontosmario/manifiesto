import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'

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
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 60_000 }),
    ).toBe(true)
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 120_000 }),
    ).toBe(true)
  })

  it('no re-bloquea si la app ya está locked', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({
        ...base,
        isUnlocked: false,
        leftActiveAt,
        now: leftActiveAt + 120_000,
      }),
    ).toBe(false)
  })

  it('el umbral default es 60s', () => {
    expect(BACKGROUND_RELOCK_THRESHOLD_MS).toBe(60_000)
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
