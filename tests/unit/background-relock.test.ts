import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'
import { LOCK_THRESHOLDS } from '@/features/auth/lock-thresholds'

describe('shouldRelock', () => {
  // Sprint R-5 — base disables grace by default (unlockedAt=null) so
  // tests pre-R-5 follow the same threshold-only semantics.
  const base = {
    thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS,
    isUnlocked: true,
    unlockedAt: null as number | null,
    gracePeriodMs: 0,
  }

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

  // Sprint R-5 — unlock grace window
  describe('unlock grace window (R-5)', () => {
    const graceBase = {
      ...base,
      thresholdMs: 5 * 60 * 1000,
      gracePeriodMs: 30 * 1000,
    }

    it('no re-bloquea si la threshold pasó pero estamos dentro del grace post-unlock', () => {
      // bg dwell 6min (> 5min threshold) pero unlock fue hace 10s (< 30s grace)
      const unlockedAt = 1_000_000
      const leftActiveAt = unlockedAt + 1000
      const now = unlockedAt + 10_000 // 10s después del unlock
      expect(
        shouldRelock({
          ...graceBase,
          leftActiveAt,
          now,
          unlockedAt,
        }),
      ).toBe(false)
    })

    it('re-bloquea si pasaron la threshold Y el grace', () => {
      // unlock → 100s de uso → bg → 6min después foreground
      // Bg dwell 6min > 5min threshold + sinceUnlock 6m40s > 30s grace
      const unlockedAt = 1_000_000
      const leftActiveAt = unlockedAt + 100_000 // 100s después del unlock
      const now = unlockedAt + 400_000 // 6min40s después del unlock (> grace AND > threshold)
      expect(
        shouldRelock({
          ...graceBase,
          leftActiveAt,
          now,
          unlockedAt,
        }),
      ).toBe(true)
    })

    it('grace=0 desactiva el window (back-compat con tests pre-R-5)', () => {
      const leftActiveAt = 1_000_000
      const now = leftActiveAt + 5 * 60 * 1000 // exactamente threshold
      expect(
        shouldRelock({
          ...graceBase,
          leftActiveAt,
          now,
          gracePeriodMs: 0,
          unlockedAt: now - 1000, // unlock hace 1s — debería ser grace pero gracePeriodMs=0 desactiva
        }),
      ).toBe(true)
    })

    it('unlockedAt=null desactiva el grace (defensa para sessions nunca unlocked)', () => {
      const leftActiveAt = 1_000_000
      const now = leftActiveAt + 5 * 60 * 1000
      expect(
        shouldRelock({
          ...graceBase,
          leftActiveAt,
          now,
          unlockedAt: null,
        }),
      ).toBe(true)
    })

    it('clock backwards entre unlock y now NO honra el grace (defensa Sprint M·L-2)', () => {
      // Si now < unlockedAt, sinceUnlock es negativo → no se aplica grace
      const unlockedAt = 2_000_000
      const leftActiveAt = unlockedAt - 100
      const now = unlockedAt - 10_000 // clock backwards 10s
      // leftActiveAt - now = 100 - (-10000) = ... wait re-check
      // leftActiveAt = unlockedAt - 100 = 1_999_900
      // now = unlockedAt - 10_000 = 1_990_000
      // delta = now - leftActiveAt = 1_990_000 - 1_999_900 = -9_900 < 0 → re-lock (Sprint M)
      expect(
        shouldRelock({
          ...graceBase,
          leftActiveAt,
          now,
          unlockedAt,
        }),
      ).toBe(true)
    })
  })
})
