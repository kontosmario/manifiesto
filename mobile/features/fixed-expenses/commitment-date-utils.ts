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

export function advanceFixedExpenseDueDate(
  currentDueOn: string | null | undefined,
  frequency: FixedExpenseFrequency,
): string {
  const baseDate = parseFixedExpenseDate(currentDueOn) ?? normalizeToStartOfDay(new Date())
  const nextDate = new Date(baseDate)

  switch (frequency) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7)
      break
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 14)
      break
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3)
      break
    case 'semiannual':
      nextDate.setMonth(nextDate.getMonth() + 6)
      break
    case 'annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1)
      break
    default:
      nextDate.setMonth(nextDate.getMonth() + 1)
      break
  }

  const year = nextDate.getFullYear()
  const month = `${nextDate.getMonth() + 1}`.padStart(2, '0')
  const day = `${nextDate.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getFixedExpenseScheduledAmount(item: FixedExpense): number {
  if (item.kind === 'debt' && typeof item.remaining_balance === 'number') {
    return clamp(Math.min(item.amount, item.remaining_balance))
  }

  return clamp(item.amount)
}
