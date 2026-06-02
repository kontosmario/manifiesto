import { describe, expect, it } from 'vitest'
import { computeRobustDailyAverage } from '@/features/insights/robust-daily-average'

describe('computeRobustDailyAverage', () => {
  it('returns zeros + hadEnoughData=false for empty input', () => {
    const r = computeRobustDailyAverage([])
    expect(r).toEqual({
      typicalAverage: 0,
      outlierDaysExcluded: 0,
      outlierDaysTotal: 0,
      hadEnoughData: false,
    })
  })

  it('falls back to plain mean when N < 5 (not enough data for robust)', () => {
    const r = computeRobustDailyAverage([100, 200, 100_000])
    expect(r.hadEnoughData).toBe(false)
    expect(r.typicalAverage).toBeCloseTo((100 + 200 + 100_000) / 3, 6)
    expect(r.outlierDaysExcluded).toBe(0)
  })

  it('drops a single extreme outlier (kontosmario real scenario)', () => {
    // 13 closed days from the 2026-05-20 cycle. May 23 + May 25 are
    // the two outlier days. With median ≈ 160k and threshold 480k,
    // both > threshold get excluded.
    const days = [
      200_400, 40_000, 287_000, 865_850, 100_000, 885_000, 300_000,
      90_000, 0, 31_100, 354_050, 160_000, 26_000,
    ]
    const r = computeRobustDailyAverage(days)
    expect(r.hadEnoughData).toBe(true)
    expect(r.outlierDaysExcluded).toBe(2)
    expect(r.outlierDaysTotal).toBe(865_850 + 885_000)
    // Typical mean = sum of the 11 non-outlier days / 11
    const nonOutliers =
      200_400 + 40_000 + 287_000 + 100_000 + 300_000 +
      90_000 + 0 + 31_100 + 354_050 + 160_000 + 26_000
    expect(r.typicalAverage).toBeCloseTo(nonOutliers / 11, 6)
  })

  it('returns plain mean when there are NO outliers (flat distribution)', () => {
    const days = [80_000, 90_000, 100_000, 110_000, 120_000, 100_000, 95_000]
    const r = computeRobustDailyAverage(days)
    expect(r.hadEnoughData).toBe(true)
    expect(r.outlierDaysExcluded).toBe(0)
    expect(r.outlierDaysTotal).toBe(0)
    expect(r.typicalAverage).toBeCloseTo(
      days.reduce((s, x) => s + x, 0) / days.length,
      6,
    )
  })

  it('applies the $50k absolute floor (avoids false positives on tiny-median days)', () => {
    // Median 1k, 3× median = 3k. Without the floor, 10k would be an
    // outlier — clearly absurd for personal finance. The 50k floor
    // means nothing under $50k can be flagged as outlier.
    const days = [500, 800, 1_000, 1_500, 2_000, 10_000, 800]
    const r = computeRobustDailyAverage(days)
    expect(r.outlierDaysExcluded).toBe(0)
  })

  it('handles all-equal days (no outliers)', () => {
    const days = [100_000, 100_000, 100_000, 100_000, 100_000, 100_000]
    const r = computeRobustDailyAverage(days)
    expect(r.outlierDaysExcluded).toBe(0)
    expect(r.typicalAverage).toBe(100_000)
  })

  it('handles a single outlier exactly at the threshold boundary', () => {
    // Median = 100, threshold = max(300, 50_000) = 50_000.
    // Day at 50_000 is NOT outlier (strict >, not >=). 50_001 IS.
    const daysAtBoundary = [100, 100, 100, 100, 100, 50_000]
    expect(computeRobustDailyAverage(daysAtBoundary).outlierDaysExcluded).toBe(0)

    const daysAboveBoundary = [100, 100, 100, 100, 100, 50_001]
    expect(computeRobustDailyAverage(daysAboveBoundary).outlierDaysExcluded).toBe(1)
  })
})
