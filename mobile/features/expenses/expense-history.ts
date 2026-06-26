import i18n from '@/lib/i18n'
import type { Category } from '@/features/categories/use-categories'
import { buildExpenseBreakdown } from '@/features/expenses/expense-history-breakdown'
import { groupExpensesByDay } from '@/features/expenses/expense-history-grouping'
import type {
  BreakdownEntry,
  ExpenseDaySection,
  ExpenseHistorySnapshot,
} from '@/features/expenses/expense-history.types'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  normalizeToStartOfDay,
} from '@/utils/pay-cycle'

export const ALL_CATEGORIES_KEY = 'all'

export const PERIOD_OPTIONS = [
  { key: 'cycle', labelKey: 'gastos:filtersScreen.periodOptions.cycle' },
  { key: 'week', labelKey: 'gastos:filtersScreen.periodOptions.week' },
  { key: 'today', labelKey: 'gastos:filtersScreen.periodOptions.today' },
  { key: 'all', labelKey: 'gastos:filtersScreen.periodOptions.all' },
] as const

export type PeriodFilter = (typeof PERIOD_OPTIONS)[number]['key']

interface BuildExpenseHistorySnapshotInput {
  categoryById: Map<string, Category>
  expenses: Expense[]
  normalizedSearch: string
  periodFilter: PeriodFilter
  primaryColor: string
  successColor: string
  selectedCategoryId: string
  searchQuery: string
  today: Date
  warningColor: string
  cycleStart: Date
  cycleEnd: Date
}

export function resolveSelectedCategoryId(
  categories: Category[],
  categorySelection: string,
): string {
  if (categorySelection === ALL_CATEGORIES_KEY) {
    return ''
  }

  return categories.some((category) => category.id === categorySelection) ? categorySelection : ''
}

export function resolveManagedCategoryId({
  categories,
  fallbackCategoryId,
  managedCategorySelection,
}: {
  categories: Category[]
  fallbackCategoryId?: string | null
  managedCategorySelection?: string | null
}): string {
  if (
    managedCategorySelection &&
    categories.some((category) => category.id === managedCategorySelection)
  ) {
    return managedCategorySelection
  }

  if (fallbackCategoryId && categories.some((category) => category.id === fallbackCategoryId)) {
    return fallbackCategoryId
  }

  return categories[0]?.id ?? ''
}

export function buildExpenseHistorySnapshot({
  categoryById,
  expenses,
  normalizedSearch,
  periodFilter,
  primaryColor,
  successColor,
  selectedCategoryId,
  searchQuery,
  today,
  warningColor,
  cycleStart,
  cycleEnd,
}: BuildExpenseHistorySnapshotInput): ExpenseHistorySnapshot {
  const safeToday = normalizeToStartOfDay(today)
  const todayStartMs = safeToday.getTime()
  const weekStart = new Date(safeToday)
  weekStart.setDate(weekStart.getDate() - 6)
  const weekStartMs = normalizeToStartOfDay(weekStart).getTime()
  const cycleStartMs = normalizeToStartOfDay(cycleStart).getTime()
  const cycleEndMs = normalizeToStartOfDay(cycleEnd).getTime()
  const filteredExpenses = expenses.filter((expense) => {
    const expenseDate = new Date(expense.created_at)
    if (Number.isNaN(expenseDate.getTime())) {
      return false
    }

    const expenseDayMs = normalizeToStartOfDay(expenseDate).getTime()

    if (periodFilter === 'today' && expenseDayMs !== todayStartMs) {
      return false
    }

    if (periodFilter === 'week' && expenseDayMs < weekStartMs) {
      return false
    }

    if (periodFilter === 'cycle' && (expenseDayMs < cycleStartMs || expenseDayMs >= cycleEndMs)) {
      return false
    }

    if (!normalizedSearch) {
      return true
    }

    const haystack = [
      expense.description,
      expense.creator_display_name,
      categoryById.get(expense.category_id)?.name ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedSearch)
  })

  const filteredTotal = filteredExpenses.reduce((sum, expense) => sum + expense.price, 0)
  const breakdown = buildExpenseBreakdown({
    categoryById,
    filteredExpenses,
    primaryColor,
    selectedCategoryId,
    successColor,
    warningColor,
  })
  const groups = groupExpensesByDay(filteredExpenses, safeToday)
  const activePeriodLabelKey =
    PERIOD_OPTIONS.find((option) => option.key === periodFilter)?.labelKey
  const activePeriodLabel = activePeriodLabelKey
    ? i18n.t(activePeriodLabelKey)
    : i18n.t('gastos:filtersScreen.cycleFallback')
  const activeScopeLabel = categoryById.get(selectedCategoryId)?.name ?? i18n.t('gastos:smartFilter.all')
  const visibleCount = i18n.t('gastos:history.visibleMovements', { count: filteredExpenses.length })
  const searchSuffix =
    normalizedSearch.length > 0 ? ` · "${searchQuery.trim()}"` : ''
  const heroSubtitle = `${visibleCount} · ${activePeriodLabel} · ${activeScopeLabel}${searchSuffix}`

  return {
    breakdown,
    filteredExpenses,
    filteredTotal,
    groups,
    heroSubtitle,
  }
}

export type { BreakdownEntry, ExpenseDaySection, ExpenseHistorySnapshot }
