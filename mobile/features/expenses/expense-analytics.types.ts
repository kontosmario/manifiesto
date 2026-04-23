import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import type { PayCycle } from '@/utils/pay-cycle'

export interface ExpenseAnalyticsSuggestion {
  detail: string
  title: string
  tone: 'primary' | 'success' | 'warning'
}

export interface ExpenseAnalyticsCategoryFocus {
  label: string
  share: number
  total: number
}

export interface ExpenseAnalyticsRecurringFocus {
  count: number
  label: string
  total: number
}

export interface ExpenseAnalyticsForecastPoint {
  dateIso: string
  projectedSpend: number
}

export interface ExpenseAnalyticsSummary {
  adjustmentNeededPerDay: number
  currentWeekTotal: number
  daysRemainingInCycle: number
  forecastSeries: ExpenseAnalyticsForecastPoint[]
  needsAttention: boolean
  projectedAvailableAtCycleEnd: number
  projectedCycleTotal: number
  recurringFocus: ExpenseAnalyticsRecurringFocus | null
  recommendedDailyCap: number
  suggestions: ExpenseAnalyticsSuggestion[]
  topCategory: ExpenseAnalyticsCategoryFocus | null
  weekendPremiumRatio: number | null
  weeklyDeltaRatio: number | null
}

export interface ComputeExpenseAnalyticsInput {
  categories: Category[]
  expenses: Expense[]
  payCycle: PayCycle
  spentInCurrentCycle: number
  today: Date
  totalAvailable: number
}
