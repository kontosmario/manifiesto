import { describe, expect, it } from 'vitest'
import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { buildTodayActions } from '@/features/insights/control-today-actions'
import type { CommitmentSummary } from '@/features/insights/control-model'

function buildDailySummary(overrides: Partial<DailyBudgetSummary> = {}): DailyBudgetSummary {
  return {
    baseDailyBudget: 5_000,
    bufferConsumed: 0,
    bufferMode: 'none',
    bufferRemaining: 0,
    bufferReserve: 0,
    carryoverAmount: 0,
    cycleDayIndex: 3,
    daysInCycle: 30,
    openingBudget: 5_000,
    operationalCycleBudget: 90_000,
    plannedVariableBudget: 90_000,
    projectedTomorrowOpening: 5_000,
    remainingRatio: 1,
    remainingToday: 5_000,
    spentBeforeToday: 0,
    spentInCurrentCycle: 0,
    status: 'positive',
    statusLabel: 'En rango',
    suggestions: [],
    todaySpent: 0,
    zeroSpendDaysInCycle: 0,
    zeroSpendStreak: 0,
    ...overrides,
  }
}

function buildCommitmentSummary(overrides: Partial<CommitmentSummary> = {}): CommitmentSummary {
  return {
    activeCount: 2,
    dueSoonCount: 0,
    overdueCount: 0,
    paidInCycleTotal: 0,
    pressureTotal: 0,
    reservedTotal: 0,
    upcomingItems: [],
    ...overrides,
  } as CommitmentSummary
}

function buildAnalytics(overrides: Partial<ExpenseAnalyticsSummary> = {}): ExpenseAnalyticsSummary {
  return {
    adjustmentNeededPerDay: 0,
    currentWeekTotal: 0,
    daysRemainingInCycle: 10,
    forecastSeries: [],
    needsAttention: false,
    projectedAvailableAtCycleEnd: 0,
    projectedCycleTotal: 0,
    recurringFocus: null,
    recommendedDailyCap: 4_500,
    suggestions: [],
    topCategory: null,
    weekendPremiumRatio: null,
    weeklyDeltaRatio: null,
    ...overrides,
  }
}

describe('control-today-actions', () => {
  it('prioriza alertar cuando el gasto flexible superó el mix objetivo', () => {
    const actions = buildTodayActions({
      commitmentSummary: buildCommitmentSummary(),
      dailyBudgetSummary: buildDailySummary(),
      expenseAnalytics: buildAnalytics({
        adjustmentNeededPerDay: 1_200,
      }),
      flexibleDelta: 8_000,
      flexibleTargetAmount: 22_000,
      hasDailyBudgetBase: true,
      isSalaryPendingConfirmation: false,
      savingsGoal: 25_000,
      savingsGoalPercent: 25,
      savingsRemaining: 18_000,
      targetFlexiblePercent: 25,
      variableSpentInCurrentCycle: 30_000,
    })

    expect(actions[1]?.title).toBe('Ya te pasaste de lo del dia a dia')
    expect(actions[1]?.detail).toContain('para el dia a dia')
  })
})
