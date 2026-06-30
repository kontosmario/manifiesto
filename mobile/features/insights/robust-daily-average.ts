// Robust daily-average estimator for the cycle projection.
//
// Problem: the previous projection (`gastoProyectadoMes = mean × cycleDays`)
// is mean-based, so a single outlier day (e.g. $885k Mercado run for a
// whole month) inflates the projection 10×+ for the remaining 18 cycle
// days. Users read the "$8M más" headline and felt the number was wrong
// even when the math was technically correct.
//
// Fix: detect outlier days (gasto > 3× median) and compute the typical
// daily average ignoring them. The projection extrapolates from the
// "calm-day" rhythm. Outliers are surfaced separately ("2 días atípicos
// descartados") so the user knows what was dropped — we never silently
// hide spending.
//
// Algorithm:
//   1. Need ≥ 5 closed days for robust estimation. Below that the
//      median is noisy and we fall back to the plain mean.
//   2. Compute median of all closed-day spends.
//   3. Threshold = max(median × 3, 50 000) — the absolute floor avoids
//      false positives on tiny-median days (e.g. cycle just started
//      with mostly $0 days; 3× $5k would flag $20k as outlier).
//   4. Partition days into "typical" (≤ threshold) and "outliers".
//   5. typical_average = mean of typical-day totals.
//   6. Return typical_average + outlier details for UI surfacing.

import { isFiniteNumber, safeDiv } from '@/features/insights/signal-guards'

const MIN_DAYS_FOR_ROBUST = 5
const OUTLIER_MEDIAN_MULTIPLIER = 3
const OUTLIER_ABSOLUTE_FLOOR = 50_000

export interface RobustDailyAverage {
  /** Mean of non-outlier days. Falls back to the plain mean when
   *  there are too few data points for robust estimation. */
  typicalAverage: number
  /** Count of days flagged as outliers (gasto > 3× median). */
  outlierDaysExcluded: number
  /** Sum of the outlier-day spending — surfaces in the UI so the
   *  user can see what was dropped from the projection rhythm. */
  outlierDaysTotal: number
  /** Whether the robust algorithm actually ran. False when
   *  `dailyTotals.length < MIN_DAYS_FOR_ROBUST` and we fell back to
   *  the plain mean. */
  hadEnoughData: boolean
}

export function computeRobustDailyAverage(
  dailyTotals: number[],
): RobustDailyAverage {
  // Validity guard: drop any non-finite (NaN/±Infinity/non-number) or
  // negative entry BEFORE any sum/sort/median. A single NaN gasto would
  // otherwise poison the mean→projection ("$NaN cycle pace"); a negative
  // value (data glitch) would deflate the rhythm. We compute exclusively
  // on the cleaned array so every downstream number stays finite.
  const clean = dailyTotals.filter((v) => isFiniteNumber(v) && v >= 0)

  if (clean.length === 0) {
    return {
      typicalAverage: 0,
      outlierDaysExcluded: 0,
      outlierDaysTotal: 0,
      hadEnoughData: false,
    }
  }

  // safeDiv guards a zero/non-finite denominator; finiteOr-style fallback
  // to 0 keeps typicalAverage finite even if the sum somehow overflows.
  const plainMean =
    safeDiv(clean.reduce((s, x) => s + x, 0), clean.length) ?? 0

  if (clean.length < MIN_DAYS_FOR_ROBUST) {
    return {
      typicalAverage: plainMean,
      outlierDaysExcluded: 0,
      outlierDaysTotal: 0,
      hadEnoughData: false,
    }
  }

  const sorted = [...clean].sort((a, b) => a - b)
  // sorted is non-empty here (clean.length >= MIN_DAYS_FOR_ROBUST); the
  // `?? 0` is a belt-and-suspenders guard so median is never undefined.
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  // Math.max with the absolute floor (50k) guarantees threshold > 0 even
  // if median is 0 (mostly $0 days), so the > comparison can't misfire.
  const threshold = Math.max(median * OUTLIER_MEDIAN_MULTIPLIER, OUTLIER_ABSOLUTE_FLOOR)

  let typicalSum = 0
  let typicalCount = 0
  let outlierCount = 0
  let outlierSum = 0
  // Iterate the cleaned array (not dailyTotals) so non-finite/negative
  // days never enter the typical sum or the outlier total.
  for (const v of clean) {
    if (v > threshold) {
      outlierCount += 1
      outlierSum += v
    } else {
      typicalSum += v
      typicalCount += 1
    }
  }

  // If every day got flagged as outlier (would only happen with
  // extremely flat distributions slightly above the floor), fall
  // back to the plain mean.
  if (typicalCount === 0) {
    return {
      typicalAverage: plainMean,
      outlierDaysExcluded: 0,
      outlierDaysTotal: 0,
      hadEnoughData: true,
    }
  }

  // safeDiv guards the (already non-zero) denominator; `?? 0` plus
  // Math.max keep typicalAverage finite and in [0, ∞) — never NaN/negative.
  const typicalAverage = Math.max(0, safeDiv(typicalSum, typicalCount) ?? 0)

  return {
    typicalAverage,
    outlierDaysExcluded: outlierCount,
    outlierDaysTotal: outlierSum,
    hadEnoughData: true,
  }
}
