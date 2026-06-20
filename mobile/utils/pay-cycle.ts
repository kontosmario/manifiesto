import { DAY_MS } from '@/utils/time'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

export interface PayCycle {
  start: Date
  end: Date
  weeks: number
  days: number
}

export function normalizeToStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function capitalizeText(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Parse YYYY-MM-DD a Date local anclado a medianoche. Evita el off-by-one
 *  por tz de `new Date("YYYY-MM-DD")` que UTC-parsea. */
export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/**
 * Build the calendar date for a given pay day. We treat `paymentDay` as
 * a literal day-of-month: if the user says "25", payday is the 25th.
 *
 * Previously this also called `moveToNextBusinessDay` to shift
 * weekend paydays to Monday. That looked clever but caused two
 * problems:
 *   1. `daysUntilPayday` computed `target` from the raw day, so
 *      the FamilyStrip pill said "Sueldo en 29 días" while the
 *      hero day chip said "día 33 de 33" — a payday on Sat 25
 *      would silently shift to Mon 27 inside the cycle math but
 *      not in the countdown.
 *   2. The user's mental model is the calendar day, not "first
 *      business day on or after". Empirically payments arrive on
 *      the calendar day for most setups; if the user wants a
 *      different day, they can pick it.
 *
 * Keeping it raw aligns every consumer (cycle math, countdown,
 * anchors) on the same day.
 */
export function buildPayDate(year: number, month: number, paymentDay: number): Date {
  const monthLastDay = new Date(year, month + 1, 0).getDate()
  const normalizedPaymentDay = Math.min(Math.max(1, paymentDay), monthLastDay)
  return normalizeToStartOfDay(new Date(year, month, normalizedPaymentDay))
}

function computeMonthAnchored(
  today: Date,
  paymentDay: number,
  freezeUntilSalaryConfirmation: boolean,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const currentMonthPayDate = buildPayDate(
    todayNormalized.getFullYear(),
    todayNormalized.getMonth(),
    paymentDay,
  )

  const cycleStart =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)
      : todayNormalized >= currentMonthPayDate
        ? currentMonthPayDate
        : buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)

  const cycleEnd =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? currentMonthPayDate
      : buildPayDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, paymentDay)

  const cycleDays = Math.max(
    1,
    Math.round((cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS),
  )

  return {
    start: cycleStart,
    end: cycleEnd,
    weeks: Math.max(1, Math.ceil(cycleDays / 7)),
    days: cycleDays,
  }
}

function computeRollingN(
  today: Date,
  anchorDate: string,
  lengthDays: number,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const anchor = parseLocalDateKey(anchorDate)
  const diffDays = Math.floor((todayNormalized.getTime() - anchor.getTime()) / DAY_MS)
  // `Math.floor` with negatives gives the right period for anchor-in-future:
  // diff=-8 with length=7 → floor(-1.14)=-2 → start = anchor + (-2*7) = anchor - 14
  const periodIndex = Math.floor(diffDays / lengthDays)
  const start = new Date(anchor)
  start.setDate(start.getDate() + periodIndex * lengthDays)
  const end = new Date(start)
  end.setDate(end.getDate() + lengthDays)
  return {
    start,
    end,
    days: lengthDays,
    weeks: Math.max(1, Math.ceil(lengthDays / 7)),
  }
}

/**
 * Computes the active pay cycle window for any cycle_type.
 *
 * For `monthly`: ancla al día-del-mes (lógica preservada del before-cycle-
 * config refactor). Para los rolling types: encuentra el período activo
 * que contiene `referenceDate`, soportando anchor pasado o futuro.
 *
 * `freezeUntilSalaryConfirmation` solo aplica a monthly — es la lógica
 * de "freeze el ciclo en el límite cuando el sueldo no fue confirmado".
 * Para rolling types es no-op (no tiene sentido conceptual).
 */
export function getCurrentPayCycle(
  referenceDate: Date,
  config: FinanceCycleConfig,
  freezeUntilSalaryConfirmation = false,
): PayCycle {
  if (config.cycle_type === 'monthly') {
    return computeMonthAnchored(referenceDate, config.salary_payment_day, freezeUntilSalaryConfirmation)
  }
  return computeRollingN(referenceDate, config.cycle_anchor_date, config.cycle_length_days)
}

/**
 * `true` cuando el cobro mensual de ESTE mes ya llegó (today >= payday) pero el
 * user todavía no lo confirmó (`lastConfirmedAt < payday`). Es el flag que
 * congela el ciclo/ventana de accounting hasta confirmar el cobro. Solo aplica
 * a `monthly`. Fuente única para que el countdown (usePayCycle) y el saldo
 * (useMonthlyAccounting) usen EXACTAMENTE la misma condición y no se
 * desincronicen.
 */
export function computeIsSalaryPendingConfirmation(
  config: FinanceCycleConfig,
  today: Date,
  lastConfirmedAt: string | null,
): boolean {
  if (config.cycle_type !== 'monthly') return false
  const todayNorm = normalizeToStartOfDay(today)
  const payDate = buildPayDate(
    todayNorm.getFullYear(),
    todayNorm.getMonth(),
    config.salary_payment_day,
  )
  if (todayNorm < payDate) return false
  if (!lastConfirmedAt) return true
  const confirmed = new Date(lastConfirmedAt)
  if (Number.isNaN(confirmed.getTime())) return true
  return normalizeToStartOfDay(confirmed) < payDate
}
