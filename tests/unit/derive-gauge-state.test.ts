import { describe, expect, it } from 'vitest'

import {
  GAUGE_LIMIT_THRESHOLD,
  GAUGE_OVER_THRESHOLD,
  deriveGaugeState,
} from '@/features/home/derive-gauge-state'

describe('deriveGaugeState — umbrales (owner: ok < 0.85 · limit 0.85–1.0 · over > 1.0)', () => {
  it('exporta las constantes fijadas por el owner', () => {
    expect(GAUGE_LIMIT_THRESHOLD).toBe(0.85)
    expect(GAUGE_OVER_THRESHOLD).toBe(1.0)
  })

  it('caso del mockup: 124k/179k ≈ 0.69 → ok', () => {
    const state = deriveGaugeState({ avgDailySpend: 124_000, dailyBudget: 179_000 })
    expect(state?.status).toBe('ok')
    expect(state?.fillRatio).toBeCloseTo(124_000 / 179_000, 10)
  })

  it('borde exacto 0.849 → ok', () => {
    expect(deriveGaugeState({ avgDailySpend: 849, dailyBudget: 1000 })?.status).toBe('ok')
  })

  it('borde exacto 0.85 → limit (inclusive)', () => {
    expect(deriveGaugeState({ avgDailySpend: 850, dailyBudget: 1000 })?.status).toBe('limit')
  })

  it('borde exacto 1.0 → limit (inclusive)', () => {
    const state = deriveGaugeState({ avgDailySpend: 1000, dailyBudget: 1000 })
    expect(state?.status).toBe('limit')
    expect(state?.fillRatio).toBe(1)
  })

  it('borde 1.001 → over', () => {
    expect(deriveGaugeState({ avgDailySpend: 1001, dailyBudget: 1000 })?.status).toBe('over')
  })

  it('gasto 0 → ok con fill 0', () => {
    const state = deriveGaugeState({ avgDailySpend: 0, dailyBudget: 179_000 })
    expect(state).toEqual({ status: 'ok', fillRatio: 0 })
  })
})

describe('deriveGaugeState — null guards (el hero oculta el medidor)', () => {
  it('dailyBudget 0 → null', () => {
    expect(deriveGaugeState({ avgDailySpend: 100, dailyBudget: 0 })).toBeNull()
  })

  it('dailyBudget negativo → null', () => {
    expect(deriveGaugeState({ avgDailySpend: 100, dailyBudget: -5 })).toBeNull()
  })

  it('datos no finitos → null', () => {
    expect(deriveGaugeState({ avgDailySpend: Number.NaN, dailyBudget: 1000 })).toBeNull()
    expect(deriveGaugeState({ avgDailySpend: 100, dailyBudget: Number.NaN })).toBeNull()
    expect(
      deriveGaugeState({ avgDailySpend: 100, dailyBudget: Number.POSITIVE_INFINITY }),
    ).toBeNull()
    expect(
      deriveGaugeState({ avgDailySpend: Number.NEGATIVE_INFINITY, dailyBudget: 1000 }),
    ).toBeNull()
  })
})

describe('deriveGaugeState — fillRatio clamp 0..1 (el status usa el ratio sin clamp)', () => {
  it('excedido lejos del cupo → fill clampeado a 1', () => {
    const state = deriveGaugeState({ avgDailySpend: 358_000, dailyBudget: 179_000 })
    expect(state?.status).toBe('over')
    expect(state?.fillRatio).toBe(1)
  })

  it('promedio negativo (defensivo) → fill clampeado a 0, status ok', () => {
    const state = deriveGaugeState({ avgDailySpend: -100, dailyBudget: 1000 })
    expect(state).toEqual({ status: 'ok', fillRatio: 0 })
  })
})
