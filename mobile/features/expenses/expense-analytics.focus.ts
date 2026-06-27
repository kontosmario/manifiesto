import i18n from '@/lib/i18n'
import type { Category } from '@/features/categories/use-categories'
import type {
  ExpenseAnalyticsCategoryFocus,
  ExpenseAnalyticsRecurringFocus,
} from '@/features/expenses/expense-analytics.types'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  addExpenseAnalyticsDays,
} from '@/features/expenses/expense-analytics.dates'
import { normalizeToStartOfDay, type PayCycle, formatLocalDateKey } from '@/utils/pay-cycle'

export function buildTopCategoryFocus({
  categories,
  expenses,
  payCycle,
  spentInCurrentCycle,
}: {
  categories: Category[]
  expenses: Expense[]
  payCycle: PayCycle
  spentInCurrentCycle: number
}): ExpenseAnalyticsCategoryFocus | null {
  const cycleCategoryTotals = new Map<string, number>()
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.displayName ?? category.name] as const),
  )

  expenses.forEach((expense) => {
    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    if (
      Number.isNaN(expenseDate.getTime()) ||
      expenseDate < payCycle.start ||
      expenseDate >= payCycle.end
    ) {
      return
    }

    cycleCategoryTotals.set(
      expense.category_id,
      (cycleCategoryTotals.get(expense.category_id) ?? 0) + expense.price,
    )
  })

  const [topCategoryId, topCategoryTotal] =
    [...cycleCategoryTotals.entries()].sort((first, second) => second[1] - first[1])[0] ?? []
  const topCategoryShare =
    spentInCurrentCycle > 0 && typeof topCategoryTotal === 'number'
      ? topCategoryTotal / spentInCurrentCycle
      : 0
  const topCategoryLabel =
    typeof topCategoryId === 'string' ? categoryNameById.get(topCategoryId) ?? i18n.t('gastos:movementRow.noCategory') : null

  if (!topCategoryLabel || typeof topCategoryTotal !== 'number') {
    return null
  }

  return {
    label: topCategoryLabel,
    share: topCategoryShare,
    total: topCategoryTotal,
  }
}

export function buildRecurringExpenseFocus({
  expenses,
  since,
}: {
  expenses: Expense[]
  since: Date
}): ExpenseAnalyticsRecurringFocus | null {
  const recurringDescriptions = new Map<string, { count: number; label: string; total: number }>()

  expenses.forEach((expense) => {
    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    if (Number.isNaN(expenseDate.getTime()) || expenseDate < since) {
      return
    }

    const normalizedDescription = expense.description.trim().toLowerCase()
    if (normalizedDescription.length < 3) {
      return
    }

    const previous = recurringDescriptions.get(normalizedDescription)
    recurringDescriptions.set(normalizedDescription, {
      count: (previous?.count ?? 0) + 1,
      label: expense.description.trim(),
      total: (previous?.total ?? 0) + expense.price,
    })
  })

  const topRecurring =
    [...recurringDescriptions.values()]
      .filter((entry) => entry.count >= 3)
      .sort((first, second) => second.total - first.total)[0] ?? null

  if (!topRecurring) {
    return null
  }

  return {
    count: topRecurring.count,
    label: topRecurring.label,
    total: topRecurring.total,
  }
}

export function buildWeekendPremiumRatio({
  dailyTotals,
  safeToday,
}: {
  dailyTotals: Map<string, number>
  safeToday: Date
}) {
  const twentyEightDaysAgo = addExpenseAnalyticsDays(safeToday, -27)
  let weekdayTotal = 0
  let weekdayCount = 0
  let weekendTotal = 0
  let weekendCount = 0

  for (let offset = 0; offset < 28; offset += 1) {
    const cursor = addExpenseAnalyticsDays(twentyEightDaysAgo, offset)
    const total = dailyTotals.get(formatLocalDateKey(cursor)) ?? 0
    if (cursor.getDay() === 0 || cursor.getDay() === 6) {
      weekendTotal += total
      weekendCount += 1
    } else {
      weekdayTotal += total
      weekdayCount += 1
    }
  }

  const weekdayAverage = weekdayCount > 0 ? weekdayTotal / weekdayCount : 0
  const weekendAverage = weekendCount > 0 ? weekendTotal / weekendCount : 0
  const weekendPremiumRatio = weekdayAverage > 0 ? weekendAverage / weekdayAverage : 0

  return weekendPremiumRatio > 0 ? weekendPremiumRatio : null
}
