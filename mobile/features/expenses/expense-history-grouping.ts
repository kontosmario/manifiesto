import type { ExpenseDaySection } from '@/features/expenses/expense-history.types'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  capitalizeText,
  formatLocalDateKey,
  normalizeToStartOfDay,
} from '@/utils/pay-cycle'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'

const dayGroupFormatOptions: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
}

export function groupExpensesByDay(expenses: Expense[], today: Date): ExpenseDaySection[] {
  const todayKey = formatLocalDateKey(today)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = formatLocalDateKey(normalizeToStartOfDay(yesterday))
  const groups: ExpenseDaySection[] = []
  const groupByKey = new Map<string, ExpenseDaySection>()

  expenses.forEach((expense) => {
    const expenseDate = new Date(expense.created_at)
    if (Number.isNaN(expenseDate.getTime())) {
      return
    }

    const normalizedDate = normalizeToStartOfDay(expenseDate)
    const groupKey = formatLocalDateKey(normalizedDate)
    const existing = groupByKey.get(groupKey)

    if (existing) {
      existing.data.push(expense)
      existing.total += expense.price
      return
    }

    const label =
      groupKey === todayKey
        ? 'Hoy'
        : groupKey === yesterdayKey
          ? 'Ayer'
          : capitalizeText(getDateTimeFormat(dayGroupFormatOptions).format(normalizedDate))

    const nextGroup: ExpenseDaySection = {
      data: [expense],
      key: groupKey,
      label,
      total: expense.price,
    }

    groups.push(nextGroup)
    groupByKey.set(groupKey, nextGroup)
  })

  return groups
}
