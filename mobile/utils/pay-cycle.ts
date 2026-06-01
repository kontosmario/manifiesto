import { DAY_MS } from '@/utils/time'

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
  if (!value) {
    return value
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/**
 * Build the calendar date for a given pay day. We treat
 * `paymentDay` as a literal day-of-month: if the user says "25",
 * payday is the 25th — full stop.
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

export function getCurrentPayCycle(
  referenceDate: Date,
  paymentDay: number,
  freezeUntilSalaryConfirmation = false,
): PayCycle {
  const today = normalizeToStartOfDay(referenceDate)
  const currentMonthPayDate = buildPayDate(
    today.getFullYear(),
    today.getMonth(),
    paymentDay,
  )

  const cycleStart =
    freezeUntilSalaryConfirmation && today >= currentMonthPayDate
      ? buildPayDate(today.getFullYear(), today.getMonth() - 1, paymentDay)
      : today >= currentMonthPayDate
        ? currentMonthPayDate
        : buildPayDate(today.getFullYear(), today.getMonth() - 1, paymentDay)

  const cycleEnd =
    freezeUntilSalaryConfirmation && today >= currentMonthPayDate
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
