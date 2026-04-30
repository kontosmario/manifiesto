// Pure helpers for the "Próximo fijo" chip (Sprint 2B).
//
// Picks the active fixed expense due soonest (forward in time) so the
// Home tab can answer "¿qué tengo que pagar pronto?" without the user
// navigating to the Fijos screen. Helpers live separately from the
// component so the date math is unit-testable.

import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { parseFixedExpenseDate } from '@/features/fixed-expenses/commitment-date-utils'

export interface NextFixedResult {
  /** UUID — used by the deep-link to focus the row in the Fijos screen. */
  id: string
  /** Display name. */
  name: string
  /** Amount in ARS. */
  amount: number
  /** Whole days from today to the due date — clamped to ≥ 0. */
  daysUntil: number
  /** Original ISO due date — passed through for the deep-link param. */
  nextDueOn: string
}

interface ComputeArgs {
  fixedExpenses: readonly FixedExpense[]
  /** Optional `now` override for deterministic tests. Defaults to a
   *  fresh `new Date()`. */
  now?: Date
  /** Optional window into the future, in days. When omitted, the
   *  helper picks the soonest active fijo regardless of how far away
   *  it is — used inside the MonthSummary Fijos panel where the
   *  sub-row is meant to always reflect the next item, even if it's
   *  weeks away. Tests can pass an explicit horizon to verify
   *  windowed behavior in isolation. */
  horizonDays?: number
  /** Optional cycle end (exclusive). When provided, fijos whose
   *  `next_due_on` falls on or after this date are excluded — that
   *  obligation belongs to a future cycle, not the current one. The
   *  Home Fijos panel passes `payCycle.end` so that, once the user
   *  pays a fijo this cycle and `next_due_on` rolls forward, the chip
   *  stops surfacing it (the next obligation isn't due yet from the
   *  perspective of this cycle's "lo que tenés que pagar"). */
  cycleEnd?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function isActive(fe: FixedExpense): boolean {
  return fe.status === 'active'
}

function startOfDayMs(d: Date): number {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out.getTime()
}

// Local-day parsing for fijos `next_due_on` (and any other bare
// `YYYY-MM-DD` string) reuses the canonical helper in
// `commitment-date-utils.ts`. Avoids a third parallel implementation
// of the same logic. Wrap with a non-null fallback for callers that
// expect a Date (the canonical helper returns Date | null).
function parseLocalDate(s: string): Date {
  return parseFixedExpenseDate(s) ?? new Date(s)
}

/**
 * Find the fixed expense due soonest from today, within the horizon.
 * Skips inactive items and items whose `next_due_on` has already
 * passed (those should have auto-rolled but defensively we exclude).
 */
export function computeNextFixed(args: ComputeArgs): NextFixedResult | null {
  const now = args.now ?? new Date()
  const todayMs = startOfDayMs(now)
  // No horizon by default — the sub-row inside the Fijos panel should
  // always reflect the next active commitment, even if it's a month
  // away. Callers can opt into a windowed view by passing horizonDays.
  const horizon = args.horizonDays
  const horizonMs =
    typeof horizon === 'number' && Number.isFinite(horizon)
      ? todayMs + horizon * DAY_MS
      : Number.POSITIVE_INFINITY
  // Cycle window — exclusive on the upper bound. When omitted the
  // chip considers any future fijo (legacy behavior preserved for
  // callers that don't want cycle-scoped filtering).
  const cycleEndMs = args.cycleEnd
    ? startOfDayMs(args.cycleEnd)
    : Number.POSITIVE_INFINITY
  let best: { fe: FixedExpense; dueMs: number } | null = null
  for (const fe of args.fixedExpenses) {
    if (!isActive(fe)) continue
    if (!fe.next_due_on) continue
    const dueMs = startOfDayMs(parseLocalDate(fe.next_due_on))
    if (Number.isNaN(dueMs)) continue
    // Skip past-due items defensively — they should be auto-rolled
    // by the backend but if the cache lags we don't surface stale data.
    if (dueMs < todayMs) continue
    if (dueMs > horizonMs) continue
    // Items whose next obligation falls in a future cycle are not
    // "lo que tenés que pagar este ciclo" — exclude them.
    if (dueMs >= cycleEndMs) continue
    if (!best || dueMs < best.dueMs) {
      best = { fe, dueMs }
    }
  }
  if (!best) return null
  const daysUntil = Math.max(0, Math.round((best.dueMs - todayMs) / DAY_MS))
  return {
    id: best.fe.id,
    name: best.fe.name,
    amount: Number(best.fe.amount ?? 0),
    daysUntil,
    nextDueOn: best.fe.next_due_on,
  }
}

/**
 * Spanish copy for "in N days" — handles the singular case and
 * "today" / "tomorrow" specifically so the chip reads naturally
 * instead of "vence en 0 días".
 */
export function formatDaysUntilDue(daysUntil: number): string {
  if (daysUntil <= 0) return 'Vence hoy'
  if (daysUntil === 1) return 'Mañana'
  return `En ${daysUntil} días`
}
