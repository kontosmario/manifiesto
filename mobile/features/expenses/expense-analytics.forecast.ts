import type { ExpenseAnalyticsForecastPoint } from '@/features/expenses/expense-analytics.types'
import {
  addExpenseAnalyticsDays,
  diffExpenseAnalyticsDays,
} from '@/features/expenses/expense-analytics.dates'
import { formatLocalDateKey } from '@/utils/pay-cycle'

export function buildExpenseForecastSeries({
  dailyRunRate,
  dailyTotals,
  fallbackDailyAverage,
  payCycleEnd,
  safeToday,
}: {
  dailyRunRate: number
  dailyTotals: Map<string, number>
  fallbackDailyAverage: number
  payCycleEnd: Date
  safeToday: Date
}): {
  forecastSeries: ExpenseAnalyticsForecastPoint[]
  projectedRemainingSpend: number
} {
  const tomorrow = addExpenseAnalyticsDays(safeToday, 1)
  const historyWindowStart = addExpenseAnalyticsDays(safeToday, -55)
  const weekdayHistory = new Map<number, number[]>()

  for (let offset = 0; offset <= 55; offset += 1) {
    const cursor = addExpenseAnalyticsDays(historyWindowStart, offset)
    const weekday = cursor.getDay()
    const total = dailyTotals.get(formatLocalDateKey(cursor)) ?? 0
    const previous = weekdayHistory.get(weekday) ?? []
    previous.push(total)
    weekdayHistory.set(weekday, previous)
  }

  const forecastExpenseForDate = (date: Date) => {
    const weekday = date.getDay()
    const bucket = (weekdayHistory.get(weekday) ?? []).slice(-8)
    const weightedAverage =
      bucket.length > 0
        ? bucket.reduce((sum, value, index) => sum + value * (index + 1), 0) /
          bucket.reduce((sum, _value, index) => sum + (index + 1), 0)
        : 0
    const baseline =
      fallbackDailyAverage > 0 && dailyRunRate > 0
        ? fallbackDailyAverage * 0.6 + dailyRunRate * 0.4
        : Math.max(fallbackDailyAverage, dailyRunRate)

    if (weightedAverage > 0 && baseline > 0) {
      return weightedAverage * 0.65 + baseline * 0.35
    }

    return weightedAverage > 0 ? weightedAverage : baseline
  }

  const daysRemaining = Math.max(0, diffExpenseAnalyticsDays(tomorrow, payCycleEnd))
  let projectedRemainingSpend = 0
  const forecastSeries: ExpenseAnalyticsForecastPoint[] = []

  for (let offset = 0; offset < daysRemaining; offset += 1) {
    const forecastDate = addExpenseAnalyticsDays(tomorrow, offset)
    const projectedSpend = forecastExpenseForDate(forecastDate)
    projectedRemainingSpend += projectedSpend
    forecastSeries.push({
      dateIso: forecastDate.toISOString(),
      projectedSpend,
    })
  }

  return {
    forecastSeries,
    projectedRemainingSpend,
  }
}
