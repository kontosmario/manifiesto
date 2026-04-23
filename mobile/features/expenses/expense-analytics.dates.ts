import type { Expense } from '@/features/expenses/use-expenses'
import { formatLocalDateKey, normalizeToStartOfDay } from '@/utils/pay-cycle'

const DAY_MS = 1000 * 60 * 60 * 24

export function addExpenseAnalyticsDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return normalizeToStartOfDay(next)
}

export function diffExpenseAnalyticsDays(start: Date, end: Date) {
  return Math.round(
    (normalizeToStartOfDay(end).getTime() - normalizeToStartOfDay(start).getTime()) / DAY_MS,
  )
}

export function sumExpensesBetween(expenses: Expense[], start: Date, endExclusive: Date) {
  const startMs = start.getTime()
  const endMs = endExclusive.getTime()

  return expenses.reduce((sum, expense) => {
    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    const expenseMs = expenseDate.getTime()

    if (Number.isNaN(expenseMs) || expenseMs < startMs || expenseMs >= endMs) {
      return sum
    }

    return sum + expense.price
  }, 0)
}

export function buildExpenseDailyTotals(expenses: Expense[]) {
  const totals = new Map<string, number>()

  expenses.forEach((expense) => {
    const dayKey = formatLocalDateKey(new Date(expense.created_at))
    totals.set(dayKey, (totals.get(dayKey) ?? 0) + expense.price)
  })

  return totals
}
