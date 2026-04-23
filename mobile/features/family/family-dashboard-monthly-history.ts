import {
  type FamilyDashboardMonthlyHistoryRow,
  type FamilyDashboardMonthlyHistoryTotals,
} from '@/features/family/family-dashboard.types'
import { capitalizeText } from '@/utils/pay-cycle'

const monthYearFormatter = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
})

export function buildMonthlyHistoryRows(
  totalsByMonth: Map<string, number>,
  monthlyIncome: number,
  savingsGoal: number,
  referenceDate: Date,
  monthsBack: number,
): FamilyDashboardMonthlyHistoryRow[] {
  const safeMonthsBack = Math.max(1, Math.floor(monthsBack))
  const currentMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
  const monthlyHistory: FamilyDashboardMonthlyHistoryRow[] = []

  for (let offset = 0; offset < safeMonthsBack; offset += 1) {
    const monthStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - offset,
      1,
    )
    const monthStartIso = monthStart.toISOString()
    const spent = totalsByMonth.get(monthStartIso) ?? 0
    const goalSpent = Math.min(savingsGoal, Math.max(0, spent - (monthlyIncome - savingsGoal)))
    const saved = Math.max(0, monthlyIncome - spent)
    const endBalance = monthlyIncome - savingsGoal - spent + goalSpent

    monthlyHistory.push({
      monthStartIso,
      fixedSpent: 0,
      spent,
      saved,
      goalSpent,
      endBalance,
      monthLabel: capitalizeText(monthYearFormatter.format(monthStart)),
      totalSpent: spent,
    })
  }

  return monthlyHistory
}

export function buildMonthlyHistoryTotals(
  monthlyHistory: FamilyDashboardMonthlyHistoryRow[],
): FamilyDashboardMonthlyHistoryTotals {
  return monthlyHistory.reduce(
    (accumulator, row) => {
      accumulator.totalSpent += row.spent
      accumulator.totalSaved += row.saved
      accumulator.totalGoalSpent += row.goalSpent
      return accumulator
    },
    {
      totalSpent: 0,
      totalSaved: 0,
      totalGoalSpent: 0,
    },
  )
}
