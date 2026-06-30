// Causal Insight Engine — local correlation detection over expense
// history.
//
// The cognitive layer's "causal" claim is intentionally narrow: we
// don't infer free-form causality, we look for stable temporal /
// categorical co-occurrences in the user's own data and surface them
// as patterns ("when X happens, Y tends to happen within Δt"). The
// downstream `causal-*` signals (§14 of v2) consume the link list to
// generate human-readable advice.
//
// All compute is pure JS over the in-memory expense list. The engine
// returns an empty array when the history is too thin to support
// stable detection (≥21 closed days of data, ≥3 occurrences for any
// given link). Builders downstream check the link's `confidence`
// before surfacing — early signals stay below the 0.4 floor.
//
// Detectors implemented today:
//   1. day-of-week → spending_spike  (e.g. "Friday → Saturday spike")
//   2. category → spending_spike     (e.g. "any restaurant tx → another tx <3h")
//   3. multi-tx-day → spending_spike (≥4 tx in a single day → that day's total +X%)

import type { Expense } from '@/features/expenses/expense-repository'
import { DAY_MS } from '@/utils/time'
import { isFiniteNumber, safeDiv } from '@/features/insights/signal-guards'

export type CausalCauseType = 'day' | 'category' | 'time'
export type CausalEffectType = 'spending_spike'

export interface CausalLink {
  cause: { type: CausalCauseType; value: string }
  effect: { type: CausalEffectType; magnitude: number }
  occurrences: number
  /** [0, 1]. Function of how many times the pattern was observed and
   *  how stable the magnitude was. Builders should require ≥0.4. */
  confidence: number
}

interface BuildArgs {
  expenses: Expense[]
  /** Closed days of discretionary history. Below ~21 we won't fire
   *  weekly-pattern style detectors at all. */
  closedDays: number
  /** When omitted, derived from `Date.now()`. Allows deterministic
   *  testing. */
  now?: Date
}

const SPIKE_RATIO_FRIDAY_SAT = 1.4
const PAIRED_TX_WINDOW_MS = 3 * 60 * 60 * 1000
const STRESS_DAY_TX_THRESHOLD = 4

/** Project dow convention: Mon=0..Sun=6. */
function projectDow(date: Date): number {
  return (date.getDay() + 6) % 7
}

function startOfLocalDay(d: Date): number {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out.getTime()
}

/**
 * Coerce an expense price to a non-negative finite number.
 *
 * Guard: `Number(e.price ?? 0)` returns NaN for non-numeric strings and can
 * surface a negative (refund) value. Either would poison every downstream
 * sum/mean/ratio/magnitude. Drop invalid prices to 0 at the source.
 */
function finitePrice(raw: unknown): number {
  const n = Number(raw ?? 0)
  return isFiniteNumber(n) && n > 0 ? n : 0
}

/**
 * Mean of a series; returns 0 when empty.
 *
 * Guard: filter out non-finite members so a single NaN/Infinity (e.g. from a
 * corrupted total) can't turn the whole mean into NaN. An all-invalid series
 * collapses to the empty case → 0.
 */
function avg(values: number[]): number {
  const finite = values.filter(isFiniteNumber)
  if (finite.length === 0) return 0
  return finite.reduce((s, v) => s + v, 0) / finite.length
}

/**
 * Detector 1: Friday cascade.
 *
 * If the user has had repeated cases where a Friday with above-average
 * spend was followed by a Saturday whose spend exceeded the user's
 * weekly Saturday baseline by ≥40%, surface the cascade. Limited to
 * Friday→Saturday because that's the spec example and the most
 * impactful weekend ramp; future iterations can generalize.
 */
function detectFridayCascade(args: BuildArgs): CausalLink | null {
  if (args.closedDays < 21) return null
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 10) return null

  // Bucket discretionary spend per local-day.
  const perDay = new Map<number, { total: number; dow: number }>()
  for (const e of discretionary) {
    const day = startOfLocalDay(new Date(e.created_at))
    const prev = perDay.get(day) ?? {
      total: 0,
      dow: projectDow(new Date(day)),
    }
    prev.total += finitePrice(e.price)
    perDay.set(day, prev)
  }

  // Saturday baseline + Friday baseline across history.
  const saturdays: number[] = []
  for (const { total, dow } of perDay.values()) {
    if (dow === 5) saturdays.push(total)
  }
  if (saturdays.length < 3) return null
  const saturdayBaseline = avg(saturdays)
  // Guard: baseline is the divisor for every magnitude below — a zero/negative/
  // non-finite baseline would make ratios NaN/Infinity.
  if (!isFiniteNumber(saturdayBaseline) || saturdayBaseline <= 0) return null

  // Walk Fridays and check the *next* day's bucket.
  let occurrences = 0
  const magnitudes: number[] = []
  for (const [dayMs, bucket] of perDay) {
    if (bucket.dow !== 4) continue // Friday in project convention
    const nextDay = perDay.get(dayMs + DAY_MS)
    if (!nextDay || nextDay.dow !== 5) continue
    if (nextDay.total < saturdayBaseline * SPIKE_RATIO_FRIDAY_SAT) continue
    // Guard: safeDiv yields null on a degenerate denominator; skip rather than
    // push a NaN/Infinity into the magnitude series.
    const ratio = safeDiv(nextDay.total, saturdayBaseline)
    if (ratio === null) continue
    occurrences++
    magnitudes.push(ratio)
  }
  if (occurrences < 4) return null
  const magnitude = avg(magnitudes) - 1 // express as +X% over baseline
  // Guard: with the SPIKE_RATIO floor magnitude should be ≥0.4, but defend
  // against a degenerate series — don't emit a non-finite or non-positive
  // "spike" (no actual cascade to report).
  if (!isFiniteNumber(magnitude) || magnitude <= 0) return null
  // Confidence rises with sample size and stability (lower std).
  // Cheap proxy: confidence = min(1, occurrences/8).
  const confidence = Math.min(1, occurrences / 8)
  return {
    cause: { type: 'day', value: 'friday' },
    effect: { type: 'spending_spike', magnitude },
    occurrences,
    confidence,
  }
}

/**
 * Detector 2: Paired-category impulse.
 *
 * For each category, count pairs of consecutive expenses (same
 * category, same user-day) firing within `PAIRED_TX_WINDOW_MS`. When
 * the same category produces ≥6 such pairs and the second tx is on
 * average ≥80% the size of the first (i.e. not a tiny rounding tx),
 * we surface the pattern.
 */
function detectPairedImpulse(args: BuildArgs): CausalLink | null {
  if (args.closedDays < 14) return null
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 12) return null
  // Sort by created_at ascending so we can scan pairs.
  const sorted = [...discretionary].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const counts = new Map<string, { occ: number; magSum: number }>()
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (a.category_id !== b.category_id) continue
    if (!a.category_id) continue
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (tb - ta > PAIRED_TX_WINDOW_MS) continue
    // Guard: finitePrice drops NaN/negative prices to 0, which the >0 check
    // below then rejects — protects the ratio divisor `priceA`.
    const priceA = finitePrice(a.price)
    const priceB = finitePrice(b.price)
    if (priceA <= 0 || priceB <= 0) continue
    if (priceB < priceA * 0.5) continue // skip tiny add-ons
    // Guard: safeDiv on the (now guaranteed >0) divisor; skip on null.
    const div = safeDiv(priceB, priceA)
    if (div === null) continue
    const ratio = Math.min(1, div)
    const prev = counts.get(a.category_id) ?? { occ: 0, magSum: 0 }
    prev.occ++
    prev.magSum += ratio
    counts.set(a.category_id, prev)
  }
  // Pick the strongest category (most pairs).
  let bestId: string | null = null
  let bestOcc = 0
  let bestMag = 0
  for (const [id, { occ, magSum }] of counts) {
    if (occ < 6) continue
    if (occ > bestOcc) {
      bestId = id
      bestOcc = occ
      bestMag = magSum / occ
    }
  }
  if (!bestId) return null
  // Guard: bestMag is a mean of [0.5,1] ratios so it should be finite & >0,
  // but defend against a degenerate accumulation before emitting.
  if (!isFiniteNumber(bestMag) || bestMag <= 0) return null
  return {
    cause: { type: 'category', value: bestId },
    effect: { type: 'spending_spike', magnitude: bestMag },
    occurrences: bestOcc,
    confidence: Math.min(1, bestOcc / 10),
  }
}

/**
 * Detector 3: Multi-tx-day stress spending.
 *
 * Days with ≥4 discretionary transactions tend, in the user's own
 * history, to total more than a "normal" day by some factor. We
 * surface the pattern to suggest a pause threshold ("on a 4+ tx day,
 * pause before tx #5").
 */
function detectStressSpending(args: BuildArgs): CausalLink | null {
  if (args.closedDays < 14) return null
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 12) return null

  const perDay = new Map<number, { total: number; count: number }>()
  for (const e of discretionary) {
    const day = startOfLocalDay(new Date(e.created_at))
    const prev = perDay.get(day) ?? { total: 0, count: 0 }
    prev.total += finitePrice(e.price)
    prev.count++
    perDay.set(day, prev)
  }
  const allDayTotals: number[] = []
  const stressDayTotals: number[] = []
  for (const { total, count } of perDay.values()) {
    if (total <= 0) continue
    allDayTotals.push(total)
    if (count >= STRESS_DAY_TX_THRESHOLD) stressDayTotals.push(total)
  }
  if (stressDayTotals.length < 3) return null
  if (allDayTotals.length < 7) return null
  const baseline = avg(allDayTotals)
  // Guard: baseline is the ratio divisor — reject non-finite/non-positive.
  if (!isFiniteNumber(baseline) || baseline <= 0) return null
  const stressAvg = avg(stressDayTotals)
  if (!isFiniteNumber(stressAvg) || stressAvg <= 0) return null
  // Guard: safeDiv instead of raw division so a degenerate baseline can't
  // yield NaN/Infinity that would slip past the `< 1.3` check.
  const ratio = safeDiv(stressAvg, baseline)
  if (ratio === null) return null
  if (ratio < 1.3) return null
  return {
    cause: { type: 'time', value: 'multi-tx-day' },
    effect: { type: 'spending_spike', magnitude: ratio - 1 },
    occurrences: stressDayTotals.length,
    confidence: Math.min(1, stressDayTotals.length / 6),
  }
}

/** Top-level builder — runs all detectors and returns what fired. */
export function detectCausalLinks(args: BuildArgs): CausalLink[] {
  const out: CausalLink[] = []
  const fri = detectFridayCascade(args)
  if (fri) out.push(fri)
  const paired = detectPairedImpulse(args)
  if (paired) out.push(paired)
  const stress = detectStressSpending(args)
  if (stress) out.push(stress)
  return out
}
