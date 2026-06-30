// Per-user calibration baselines.
//
// Hardcoded thresholds (40% category dominance, 1.4× acceleration,
// 70% night-spend) are average-of-everyone defaults — they fire
// constantly for some users, never for others. This module computes
// percentile-based thresholds from the user's *own* closed cycles so
// each signal adapts to what's actually anomalous for THAT user.
//
// Strategy:
//  - For each metric we care about, derive a per-cycle observation
//    from `monthly_summaries`.
//  - Take P75 (75th percentile) of those observations as the
//    "above what's normal" floor.
//  - Need ≥3 closed cycles to trust the baseline. Below that we
//    return null for that metric and the signal falls back to its
//    hardcoded constant.
//
// The baselines object is pure — computed once per render in the
// hook, threaded through `BuildSignalsArgs`. No state, no side
// effects.

import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import { isFiniteNumber, safeDiv } from '@/features/insights/signal-guards'

export interface UserBaselines {
  /** P75 of "top category share of total variable spend" across
   *  closed cycles. Replaces the hardcoded 40% threshold for
   *  `cat-dominance` when ≥3 cycles available. Always ≥ 0.40. */
  catDominanceP75: number | null
  /** P75 of any single category's ratio against its own historical
   *  mean across closed cycles. Replaces the hardcoded 1.4×
   *  acceleration multiplier for `cat-accel`. Always ≥ 1.4. */
  catAccelP75: number | null
  /** Number of closed cycles that fed these calculations. Used by
   *  the UI to show "según N meses" disclaimers. */
  closedCycles: number
}

/**
 * Minimum closed cycles before per-user calibration kicks in. Below
 * 3 cycles a single outlier dominates the percentile — better to
 * fall back to the global constant.
 */
const MIN_CYCLES = 3

export function computeUserBaselines(
  summaries: MonthlySummaryHistory[],
): UserBaselines {
  if (summaries.length < MIN_CYCLES) {
    return {
      catDominanceP75: null,
      catAccelP75: null,
      closedCycles: summaries.length,
    }
  }

  // ── Top category share per cycle (drives cat-dominance baseline)
  const dominanceObs: number[] = []
  for (const s of summaries) {
    const breakdown = s.category_breakdown
    if (!breakdown) continue
    const entries = normalizeBreakdownEntries(breakdown)
    if (entries.length === 0) continue
    const total = entries.reduce((sum, e) => sum + e.amount, 0)
    // Guard: entries are pre-filtered to finite >0 amounts, so total is finite;
    // still reject a non-finite/non-positive total before it becomes a divisor.
    if (!isFiniteNumber(total) || total <= 0) continue
    const top = entries.reduce((a, b) => (b.amount > a.amount ? b : a))
    // Guard: safeDiv yields null on a degenerate denominator; skip rather than
    // feed NaN/Infinity into the percentile series.
    const share = safeDiv(top.amount, total)
    if (share === null) continue
    dominanceObs.push(share)
  }

  // ── Per-category-vs-history ratio per cycle
  // For each summary at index i, compare each category's share against
  // the average share across summaries[i+1..]. The biggest ratio in
  // that cycle is the "acceleration peak" we'd have shown then. Take
  // P75 across those peaks → personal acceleration threshold.
  const accelObs: number[] = []
  for (let i = 0; i < summaries.length - 1; i++) {
    const cur = summaries[i]
    if (!cur) continue
    const curEntries = normalizeBreakdownEntries(cur.category_breakdown)
    if (curEntries.length === 0) continue
    let peak = 0
    for (const e of curEntries) {
      const baseline = avgCategoryAcrossPriors(summaries.slice(i + 1), e.name)
      // Guard: baseline is the ratio divisor — reject non-finite/non-positive
      // (a category appearing from $0 is not an "acceleration of a trend").
      if (!isFiniteNumber(baseline) || baseline <= 0) continue
      // Guard: safeDiv keeps a degenerate baseline from yielding NaN/Infinity.
      const ratio = safeDiv(e.amount, baseline)
      if (ratio === null) continue
      if (ratio > peak) peak = ratio
    }
    if (peak > 0) accelObs.push(peak)
  }

  return {
    catDominanceP75:
      dominanceObs.length >= MIN_CYCLES
        ? Math.max(0.4, percentile(dominanceObs, 0.75))
        : null,
    catAccelP75:
      accelObs.length >= MIN_CYCLES
        ? Math.max(1.4, percentile(accelObs, 0.75))
        : null,
    closedCycles: summaries.length,
  }
}

interface BreakdownEntry {
  name: string
  amount: number
}

function normalizeBreakdownEntries(
  breakdown: MonthlySummaryHistory['category_breakdown'],
): BreakdownEntry[] {
  if (!breakdown) return []
  if (Array.isArray(breakdown)) {
    return breakdown
      .map((e) => ({
        name: String(e.name ?? ''),
        amount: Number(e.total ?? 0),
      }))
      // Guard: require a finite, positive amount. Number("abc") → NaN; this
      // keeps a malformed entry out of every sum/mean/ratio downstream.
      .filter((e) => e.name && isFiniteNumber(e.amount) && e.amount > 0)
  }
  return Object.entries(breakdown as Record<string, { amount?: number }>)
    .map(([name, v]) => ({ name, amount: Number(v?.amount ?? 0) }))
    // Guard: same finite+positive requirement for the legacy Record shape.
    .filter((e) => isFiniteNumber(e.amount) && e.amount > 0)
}

function avgCategoryAcrossPriors(
  priors: MonthlySummaryHistory[],
  categoryName: string,
): number {
  if (priors.length === 0) return 0
  let total = 0
  let count = 0
  for (const p of priors) {
    const entries = normalizeBreakdownEntries(p.category_breakdown)
    const match = entries.find((e) => e.name === categoryName)
    if (!match) continue
    total += match.amount
    count += 1
  }
  if (count === 0) return 0
  // Guard: safeDiv returns null on a degenerate denominator/non-finite total;
  // collapse to 0 (the "no prior data" shape) so the mean never escapes as NaN.
  return safeDiv(total, count) ?? 0
}

/** Linear-interpolation percentile. Expects 0 ≤ p ≤ 1. */
function percentile(values: number[], p: number): number {
  // Guard: drop non-finite members so a single NaN/Infinity can't sort
  // unpredictably and surface as the percentile result.
  const finite = values.filter(isFiniteNumber)
  if (finite.length === 0) return 0
  // Guard: clamp p into [0,1] so idx stays within bounds (an out-of-range p
  // would index past the array and yield undefined → NaN arithmetic).
  const pClamped = p < 0 ? 0 : p > 1 ? 1 : p
  const sorted = [...finite].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * pClamped
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const frac = idx - lo
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac
}
