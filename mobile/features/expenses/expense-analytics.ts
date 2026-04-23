import {
  addExpenseAnalyticsDays,
  buildExpenseAnalyticsSuggestions,
  buildExpenseDailyTotals,
  buildExpenseForecastSeries,
  buildRecurringExpenseFocus,
  buildTopCategoryFocus,
  buildWeekendPremiumRatio,
  diffExpenseAnalyticsDays,
  sumExpensesBetween,
} from '@/features/expenses/expense-analytics.helpers'
import type {
  ComputeExpenseAnalyticsInput,
  ExpenseAnalyticsCategoryFocus,
  ExpenseAnalyticsForecastPoint,
  ExpenseAnalyticsRecurringFocus,
  ExpenseAnalyticsSuggestion,
  ExpenseAnalyticsSummary,
} from '@/features/expenses/expense-analytics.types'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'

export type {
  ComputeExpenseAnalyticsInput,
  ExpenseAnalyticsCategoryFocus,
  ExpenseAnalyticsForecastPoint,
  ExpenseAnalyticsRecurringFocus,
  ExpenseAnalyticsSuggestion,
  ExpenseAnalyticsSummary,
}

export function computeExpenseAnalytics({
  categories,
  expenses,
  payCycle,
  spentInCurrentCycle,
  today,
  totalAvailable,
}: ComputeExpenseAnalyticsInput): ExpenseAnalyticsSummary {
  const safeToday = normalizeToStartOfDay(today)
  const tomorrow = addExpenseAnalyticsDays(safeToday, 1)
  const sevenDaysAgo = addExpenseAnalyticsDays(safeToday, -6)
  const fourteenDaysAgo = addExpenseAnalyticsDays(safeToday, -13)
  const twentyEightDaysAgo = addExpenseAnalyticsDays(safeToday, -27)
  const recentSixtyDays = addExpenseAnalyticsDays(safeToday, -59)
  const dailyTotals = buildExpenseDailyTotals(expenses)

  const currentWeekTotal = sumExpensesBetween(expenses, sevenDaysAgo, tomorrow)
  const previousWeekTotal = sumExpensesBetween(expenses, fourteenDaysAgo, sevenDaysAgo)
  const weeklyDeltaRatio =
    previousWeekTotal > 0 ? (currentWeekTotal - previousWeekTotal) / previousWeekTotal : null
  const cycleDaysElapsed = Math.max(1, diffExpenseAnalyticsDays(payCycle.start, safeToday) + 1)
  const daysRemainingInCycle = Math.max(1, diffExpenseAnalyticsDays(safeToday, payCycle.end))
  const dailyRunRate = spentInCurrentCycle / cycleDaysElapsed
  const recentTwentyEightTotal = sumExpensesBetween(expenses, twentyEightDaysAgo, tomorrow)
  const fallbackDailyAverage = recentTwentyEightTotal / 28

  const { forecastSeries, projectedRemainingSpend } = buildExpenseForecastSeries({
    dailyRunRate,
    dailyTotals,
    fallbackDailyAverage,
    payCycleEnd: payCycle.end,
    safeToday,
  })

  const projectedCycleTotal = spentInCurrentCycle + projectedRemainingSpend
  const projectedAvailableAtCycleEnd = totalAvailable - projectedRemainingSpend
  const recommendedDailyCap = Math.max(0, totalAvailable / daysRemainingInCycle)
  const adjustmentNeededPerDay =
    projectedAvailableAtCycleEnd < 0
      ? Math.abs(projectedAvailableAtCycleEnd) / Math.max(forecastSeries.length, 1)
      : 0

  const topCategory = buildTopCategoryFocus({
    categories,
    expenses,
    payCycle,
    spentInCurrentCycle,
  })
  const recurringFocus = buildRecurringExpenseFocus({
    expenses,
    since: recentSixtyDays,
  })
  const weekendPremiumRatio = buildWeekendPremiumRatio({
    dailyTotals,
    safeToday,
  })
  const suggestions = buildExpenseAnalyticsSuggestions({
    adjustmentNeededPerDay,
    daysRemaining: forecastSeries.length,
    expenses,
    projectedAvailableAtCycleEnd,
    recurringFocus,
    topCategory,
    weeklyDeltaRatio,
    weekendPremiumRatio,
  })

  return {
    adjustmentNeededPerDay,
    currentWeekTotal,
    daysRemainingInCycle,
    forecastSeries,
    needsAttention:
      projectedAvailableAtCycleEnd < 0 ||
      adjustmentNeededPerDay > 0 ||
      (weeklyDeltaRatio ?? 0) >= 0.15,
    projectedAvailableAtCycleEnd,
    projectedCycleTotal,
    recurringFocus,
    recommendedDailyCap,
    suggestions,
    topCategory,
    weekendPremiumRatio,
    weeklyDeltaRatio,
  }
}
