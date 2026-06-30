// 7-day rolling forecast for the Asistente Financiero.
//
// The cycle-level projection (`view.gastoProyectadoMes`) is a linear
// extrapolation that loses resolution as the cycle progresses. The
// forecast engine here is more granular: it predicts daily spend over
// the next 7 days under three scenarios and surfaces "inflection days"
// where commitments or historical DoW patterns concentrate cargos.
//
// Design notes:
//  - Pure-compute, no side effects. Pure functions on a snapshot.
//  - Memoized in the adapter; recomputed only when expenses or
//    fixed-expenses change.
//  - Consumes the same DoW + per-day data that already powers the
//    Control v2 surface — no new SQL.
//  - Output is consumed both by builders (`forecast-tomorrow-risk`,
//    `forecast-storm-week`, `forecast-payday-gap`) and by future UI
//    visualizations.

import type { ControlView, DowBucket } from '@/features/insights/control-v2-mock'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { parseFixedExpenseDate } from '@/features/fixed-expenses/commitment-date-utils'
import { finiteOr, isFiniteNumber } from '@/features/insights/signal-guards'
import { DAY_MS } from '@/utils/time'

export interface ForecastTrack {
  /** Per-day projected discretionary spend, length 7. */
  daily: number[]
  /** Sum of `daily`. */
  totalProjected: number
  /** `view.restanteMes - totalProjected`. May go negative. */
  endingBalance: number
  /** `totalProjected / 7`. */
  dailyAvg: number
}

export type InflectionEvent =
  | 'fixed_payment'
  | 'historical_high_dow'
  | 'paydate_proximity'

export interface InflectionDay {
  /** ISO yyyy-mm-dd of the day in question. */
  day: string
  event: InflectionEvent
  /** Expected magnitude in ARS (commitment amount, dow avg, etc.). */
  expectedAmount: number
  /** Short human-readable label suitable for tooltips and chip copy. */
  description: string
}

export interface Forecast7Day {
  generatedAt: string
  horizon: 7
  baseline: ForecastTrack
  optimistic: ForecastTrack
  pessimistic: ForecastTrack
  inflectionDays: InflectionDay[]
}

interface ForecastInput {
  view: ControlView
  fixedExpenses: FixedExpense[]
  /** Days remaining in the cycle. Used to clamp tracks if cycle ends < 7d. */
  diasRestantes: number
  remaining: number
  now?: Date
}

/** Convert a JS dow (0=Sun..6=Sat) to the project's convention (0=Mon..6=Sun). */
function jsDowToProject(jsDow: number): number {
  return (jsDow + 6) % 7
}

const DOW_NAMES_FROM_PROJECT_INDEX = [
  'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom',
] as const

const DOW_NAMES_FULL = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
] as const

/** Resolve a `DowBucket` by project-dow index, matching by short name. */
function bucketForDow(buckets: DowBucket[], projectDow: number): DowBucket | undefined {
  const target = DOW_NAMES_FROM_PROJECT_INDEX[projectDow]
  return buckets.find((b) => b.name === target)
}

function isoDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Build a track by combining a base daily figure with any fixed
 * commitments due that day. The cycle horizon is capped to the lower
 * of 7 and `cycleHorizon` so the projection can't overshoot the cycle.
 */
function projectTrack(args: {
  cycleHorizon: number
  perDayBase: (offset: number, dayDate: Date) => number
  fixedByDay: Map<string, number>
  startDate: Date
}): ForecastTrack {
  // Guard a non-finite/negative horizon (e.g. NaN diasRestantes): clamp
  // to [0, 7] with finiteOr so the loop bound is always a valid integer.
  const horizon = Math.max(0, Math.min(7, finiteOr(args.cycleHorizon, 0)))
  const daily: number[] = []
  for (let i = 0; i < 7; i++) {
    if (i >= horizon) {
      daily.push(0)
      continue
    }
    const dayDate = new Date(args.startDate.getTime() + i * DAY_MS)
    // finiteOr(...,0) catches a NaN/Infinity perDayBase result (e.g. a
    // corrupt DoW avg) before Math.max/Math.round; a non-finite base
    // would otherwise push NaN into daily[] and poison totalProjected.
    const base = Math.max(0, finiteOr(args.perDayBase(i, dayDate), 0))
    // fixedByDay only ever holds finite, non-negative sums (see
    // fixedByDayInWindow), but finiteOr keeps this robust to future edits.
    const fixed = Math.max(0, finiteOr(args.fixedByDay.get(isoDay(dayDate)) ?? 0, 0))
    daily.push(Math.round(base + fixed))
  }
  const totalProjected = daily.reduce((s, v) => s + v, 0)
  return {
    daily,
    totalProjected,
    endingBalance: 0, // filled in by caller (needs `remaining`)
    // horizon > 0 guarantees a non-zero finite denominator here; the
    // ternary returns 0 (not NaN) for an empty horizon.
    dailyAvg: horizon > 0 ? totalProjected / horizon : 0,
  }
}

/** A zero-filled track: 7 days of 0 spend. Used when there is not enough
 *  history to extrapolate, so we surface absence rather than a fabricated
 *  (or NaN) projection. `endingBalance` is filled in by the caller. */
function zeroTrack(): ForecastTrack {
  return {
    daily: [0, 0, 0, 0, 0, 0, 0],
    totalProjected: 0,
    endingBalance: 0,
    dailyAvg: 0,
  }
}

/** A fully zeroed forecast for the "insufficient history" case. All tracks
 *  are zeroed so downstream signal builders (which gate on
 *  `dailyAvg > 0` / `totalProjected > remaining`) naturally suppress —
 *  the engine never extrapolates from an invalid baseline. */
function insufficientForecast(now: Date, remaining: number): Forecast7Day {
  const safeRemaining = finiteOr(remaining, 0)
  const baseline = zeroTrack()
  baseline.endingBalance = safeRemaining
  const optimistic = zeroTrack()
  optimistic.endingBalance = safeRemaining
  const pessimistic = zeroTrack()
  pessimistic.endingBalance = safeRemaining
  return {
    generatedAt: now.toISOString(),
    horizon: 7,
    baseline,
    optimistic,
    pessimistic,
    inflectionDays: [],
  }
}

/**
 * Group fixed expenses due within the next 7 days by their `next_due_on`
 * date string. Only the first occurrence is counted — recurring
 * frequencies (weekly/biweekly) typically have a single hit in this
 * window, so we don't try to expand them here.
 */
function fixedByDayInWindow(
  fixedExpenses: FixedExpense[],
  startDate: Date,
): Map<string, number> {
  const out = new Map<string, number>()
  const startMs = startDate.getTime()
  const endMs = startMs + 7 * DAY_MS
  for (const f of fixedExpenses) {
    if (f.status !== 'active') continue
    if (!f.next_due_on) continue
    // `parseFixedExpenseDate` interprets bare YYYY-MM-DD strings as
    // local-day midnight. The naive `new Date(...)` parses as UTC —
    // which in negative-UTC timezones (Argentina among them) shifts
    // the due date one day earlier and drops fijos from the 7-day
    // window incorrectly.
    const due = parseFixedExpenseDate(f.next_due_on)
    // Skip unparseable dates (parseFixedExpenseDate returns null) and any
    // date whose getTime() is NaN — an Invalid Date would otherwise pass
    // the range check unpredictably and emit a NaN-keyed entry.
    if (!due || !isFiniteNumber(due.getTime())) continue
    if (due.getTime() < startMs || due.getTime() >= endMs) continue
    // Only fold in finite, positive amounts. A NaN/negative `amount`
    // (data glitch) would otherwise corrupt the day's fixed sum and flow
    // straight into totalProjected and the fixed_payment inflection.
    const amount = Number(f.amount ?? 0)
    if (!isFiniteNumber(amount) || amount <= 0) continue
    const key = isoDay(due)
    out.set(key, (out.get(key) ?? 0) + amount)
  }
  return out
}

export function buildForecast7Day(input: ForecastInput): Forecast7Day {
  const now = input.now ?? new Date()
  const tomorrow = startOfDay(new Date(now.getTime() + DAY_MS))
  // finiteOr(...,0) first: Math.max(0, NaN) === NaN, so a non-finite
  // promedioDiario would slip through Math.max and contaminate every
  // track. Normalize to a finite, non-negative baseline.
  const baselineDailyAvg = Math.max(0, finiteOr(input.view.promedioDiario, 0))

  // Insufficient-history gate: with a zero/non-finite baseline there is
  // no valid rhythm to extrapolate. Return a fully zeroed forecast
  // instead of fabricating (or NaN-propagating) a projection. Downstream
  // signal builders gate on dailyAvg > 0 / totalProjected > remaining, so
  // a zeroed forecast cleanly suppresses them ("dato ausente").
  if (!isFiniteNumber(baselineDailyAvg) || baselineDailyAvg <= 0) {
    return insufficientForecast(now, input.remaining)
  }

  const peorDow = input.view.peorDow
  const fixedByDay = fixedByDayInWindow(input.fixedExpenses, tomorrow)

  // Normalize `remaining` to a finite value once. endingBalance may be
  // negative (per contract) so we don't clamp it — but a non-finite
  // `remaining` would make every endingBalance NaN, which we must not emit.
  const safeRemaining = finiteOr(input.remaining, 0)

  const baseline = projectTrack({
    cycleHorizon: input.diasRestantes,
    perDayBase: () => baselineDailyAvg,
    fixedByDay,
    startDate: tomorrow,
  })
  baseline.endingBalance = safeRemaining - baseline.totalProjected

  const optimistic = projectTrack({
    cycleHorizon: input.diasRestantes,
    perDayBase: () => baselineDailyAvg * 0.8,
    fixedByDay,
    startDate: tomorrow,
  })
  optimistic.endingBalance = safeRemaining - optimistic.totalProjected

  const pessimistic = projectTrack({
    cycleHorizon: input.diasRestantes,
    perDayBase: (_, dayDate) => {
      const projectDow = jsDowToProject(dayDate.getDay())
      const bucket = bucketForDow(input.view.porDowEnriched, projectDow)
      // Fall back to baseline when the DoW bucket is missing, non-finite,
      // OR averages zero (e.g. the user has had a no-spend streak on this
      // DoW). A `0 * 1.2` / `NaN * 1.2` projection would zero out / poison
      // the daily base and miscompute the days-to-zero downstream.
      const dowAvg =
        bucket && isFiniteNumber(bucket.avg) && bucket.avg > 0
          ? bucket.avg
          : baselineDailyAvg
      return dowAvg * 1.2
    },
    fixedByDay,
    startDate: tomorrow,
  })
  pessimistic.endingBalance = safeRemaining - pessimistic.totalProjected

  // ─── Inflection days ─────────────────────────────────────────────
  const inflectionDays: InflectionDay[] = []

  // 1. Active fixed-expense due dates in window.
  for (const [iso, amount] of fixedByDay.entries()) {
    inflectionDays.push({
      day: iso,
      event: 'fixed_payment',
      expectedAmount: Math.round(amount),
      // @i18n-ignore (not user-facing yet): `inflectionDays[].description`
      // no se renderiza en ninguna UI hoy (ningún componente lee
      // `forecast.inflectionDays`); es copy reservada para una
      // visualización futura. Extraer a `insights:` cuando se cablee a
      // una pantalla real.
      description: 'Pago fijo programado',
    })
  }

  // 2. Days whose DoW historically averages > 1.6× baseline.
  if (baselineDailyAvg > 0) {
    for (let i = 0; i < Math.min(7, input.diasRestantes); i++) {
      const dayDate = new Date(tomorrow.getTime() + i * DAY_MS)
      const projectDow = jsDowToProject(dayDate.getDay())
      const bucket = bucketForDow(input.view.porDowEnriched, projectDow)
      if (!bucket) continue
      // Require a finite avg: a NaN avg would make the `<=` comparison
      // false (skipping the `continue`) and push Math.round(NaN) = NaN
      // into expectedAmount.
      if (!isFiniteNumber(bucket.avg)) continue
      if (bucket.avg <= baselineDailyAvg * 1.6) continue
      inflectionDays.push({
        day: isoDay(dayDate),
        event: 'historical_high_dow',
        expectedAmount: Math.round(bucket.avg),
        // @i18n-ignore (not user-facing yet): ver nota arriba — copy de
        // inflectionDays sin consumidor de UI todavía.
        description: `${DOW_NAMES_FULL[projectDow]} suele ser caro`,
      })
    }
  }

  // 3. Payday proximity — flag the last day of the cycle as an
  //    inflection so the UI can show the gap risk visually.
  if (input.diasRestantes > 0 && input.diasRestantes <= 7) {
    const paydayPrev = new Date(
      tomorrow.getTime() + (input.diasRestantes - 1) * DAY_MS,
    )
    inflectionDays.push({
      day: isoDay(paydayPrev),
      event: 'paydate_proximity',
      expectedAmount: 0,
      // @i18n-ignore (not user-facing yet): ver nota arriba — copy de
      // inflectionDays sin consumidor de UI todavía.
      description: 'Último día antes del cobro',
    })
  }

  inflectionDays.sort((a, b) => a.day.localeCompare(b.day))

  // Note: peorDow is read above purely so the tree-shaker keeps the
  // bucket alongside `porDowEnriched`. The pessimistic track and dow
  // inflections both consume the underlying buckets directly.
  void peorDow

  return {
    generatedAt: now.toISOString(),
    horizon: 7,
    baseline,
    optimistic,
    pessimistic,
    inflectionDays,
  }
}
