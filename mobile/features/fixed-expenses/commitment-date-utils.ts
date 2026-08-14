import { normalizeToStartOfDay } from '@/utils/pay-cycle'
import type { FixedExpense, FixedExpenseFrequency } from './fixed-expense-types'

export function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.max(min, Math.min(value, max))
}

export function parseFixedExpenseDate(value?: string | null): Date | null {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const parsedIso = new Date(`${normalized}T00:00:00`)
    return Number.isNaN(parsedIso.getTime()) ? null : normalizeToStartOfDay(parsedIso)
  }

  const localMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!localMatch) {
    return null
  }

  const [, dayText, monthText, yearText] = localMatch
  const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText))
  return Number.isNaN(parsed.getTime()) ? null : normalizeToStartOfDay(parsed)
}

export function formatFixedExpenseDateInput(value?: string | null): string {
  const parsed = parseFixedExpenseDate(value)
  if (!parsed) {
    return ''
  }

  const day = `${parsed.getDate()}`.padStart(2, '0')
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const year = `${parsed.getFullYear()}`
  return `${day}/${month}/${year}`
}

export function serializeFixedExpenseDateInput(value: string): string | null {
  const parsed = parseFixedExpenseDate(value)
  if (!parsed) {
    return null
  }

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Espejo EXACTO de `advance_fixed_expense_due_date` (SQL, migración
 * 20260423141534). weekly/biweekly suman días e ignoran el ancla;
 * el resto salta meses y re-ancla a `dayOfMonth` clampado a los días
 * reales del mes destino (31 → feb 28/29 → vuelve a 31 en marzo).
 * Sin `dayOfMonth` se conserva el día base, también clampado (igual
 * que el interval math de Postgres).
 */
export function advanceFixedExpenseDueDate(
  currentDueOn: string,
  frequency: FixedExpenseFrequency,
  dayOfMonth?: number | null,
): string {
  const m = currentDueOn.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return currentDueOn
  const [, y, mo, d] = m
  let year = Number(y)
  let month = Number(mo) // 1..12
  const baseDay = Number(d)

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const days = frequency === 'weekly' ? 7 : 14
    const next = new Date(Date.UTC(year, month - 1, baseDay + days))
    return next.toISOString().slice(0, 10)
  }

  const monthsToAdd =
    frequency === 'quarterly' ? 3 : frequency === 'semiannual' ? 6 : frequency === 'annual' ? 12 : 1
  const zeroBased = month - 1 + monthsToAdd
  year += Math.floor(zeroBased / 12)
  month = (zeroBased % 12) + 1

  const daysInTarget = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const anchor = dayOfMonth ?? baseDay
  const safeDay = Math.min(Math.max(anchor, 1), daysInTarget)
  const yyyy = String(year)
  const mm = String(month).padStart(2, '0')
  const dd = String(safeDay).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getFixedExpenseScheduledAmount(item: FixedExpense): number {
  if (item.kind === 'debt' && typeof item.remaining_balance === 'number') {
    return clamp(Math.min(item.amount, item.remaining_balance))
  }

  return clamp(item.amount)
}
