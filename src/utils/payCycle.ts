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

function moveToNextBusinessDay(date: Date): Date {
  const next = normalizeToStartOfDay(date)

  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1)
  }

  return next
}

export function buildPayDate(year: number, month: number, paymentDay: number): Date {
  const monthLastDay = new Date(year, month + 1, 0).getDate()
  const normalizedPaymentDay = Math.min(Math.max(1, paymentDay), monthLastDay)
  return moveToNextBusinessDay(new Date(year, month, normalizedPaymentDay))
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
    Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const cycleWeeks = Math.max(1, Math.ceil(cycleDays / 7))

  return {
    start: cycleStart,
    end: cycleEnd,
    weeks: cycleWeeks,
    days: cycleDays,
  }
}
