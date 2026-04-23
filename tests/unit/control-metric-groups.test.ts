import { describe, expect, it } from 'vitest'
import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { buildHeroMetrics, buildTodayMetrics } from '@/features/insights/control-metric-groups'
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

describe('control-metric-groups', () => {
  it('prioriza el pendiente fijo en el hero cuando hay compromisos reservados', () => {
    const metrics = buildHeroMetrics({
      commitmentSummary: buildCommitmentSummary({
        dueSoonCount: 2,
        overdueCount: 1,
        reservedTotal: 18_000,
      }),
      dailyBudgetSummary: buildDailySummary(),
      flexibleDelta: 4_000,
      flexibleTargetAmount: 20_000,
      hasDailyBudgetBase: true,
      remainingUntilPayday: 6,
      savingsGoalPercent: 25,
      targetFlexiblePercent: 25,
      variableSpentInCurrentCycle: 24_000,
    })

    expect(metrics[2]?.label).toBe('Pendiente fijo')
    expect(metrics[2]?.tone).toBe('warning')
  })

  it('muestra el desvío flexible cuando no hay fijo reservado', () => {
    const metrics = buildHeroMetrics({
      commitmentSummary: buildCommitmentSummary(),
      dailyBudgetSummary: buildDailySummary(),
      flexibleDelta: -6_000,
      flexibleTargetAmount: 25_000,
      hasDailyBudgetBase: true,
      remainingUntilPayday: 6,
      savingsGoalPercent: 25,
      targetFlexiblePercent: 25,
      variableSpentInCurrentCycle: 19_000,
    })

    expect(metrics[2]?.label).toBe('Desvio flexible')
    expect(metrics[2]?.tone).toBe('success')
    expect(metrics[2]?.value).toContain('-$')
  })

  it('arma métricas diarias con deuda cuando el arrastre es negativo', () => {
    const metrics = buildTodayMetrics({
      dailyBudgetSummary: buildDailySummary({
        carryoverAmount: -2_500,
        projectedTomorrowOpening: 1_200,
        todaySpent: 6_400,
      }),
      expenseAnalytics: buildAnalytics(),
      hasDailyBudgetBase: true,
    })

    expect(metrics[1]?.label).toBe('Deuda diaria')
    expect(metrics[1]?.tone).toBe('warning')
    expect(metrics[3]?.label).toBe('Manana abre')
  })
})
