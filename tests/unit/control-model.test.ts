import { describe, expect, it } from 'vitest'
import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  buildHeroState,
  formatDeltaPercent,
  formatRemainingDays,
  type CommitmentSummary,
} from '@/features/insights/control-model'

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
    recommendedDailyCap: 0,
    suggestions: [],
    topCategory: null,
    weekendPremiumRatio: null,
    weeklyDeltaRatio: null,
    ...overrides,
  }
}

describe('control-model helpers', () => {
  it('formatea deltas y días con copy legible', () => {
    expect(formatDeltaPercent(0.17)).toBe('+17%')
    expect(formatDeltaPercent(-0.08)).toBe('-8%')
    expect(formatDeltaPercent(null)).toBe('Sin base')
    expect(formatRemainingDays(0)).toBe('Hoy')
    expect(formatRemainingDays(1)).toBe('1 dia')
    expect(formatRemainingDays(4)).toBe('4 dias')
  })

  it('prioriza confirmación de cobro cuando el ciclo está pendiente', () => {
    const hero = buildHeroState({
      commitmentSummary: buildCommitmentSummary(),
      dailyBudgetSummary: buildDailySummary(),
      expenseAnalytics: null,
      hasDailyBudgetBase: true,
      isSalaryPendingConfirmation: true,
      remainingUntilPayday: 0,
    })

    expect(hero.variant).toBe('accent')
    expect(hero.title).toContain('Confirma tu cobro')
  })

  it('marca ajuste sugerido cuando la proyección exige recorte diario', () => {
    const hero = buildHeroState({
      commitmentSummary: buildCommitmentSummary(),
      dailyBudgetSummary: buildDailySummary(),
      expenseAnalytics: buildAnalytics({ adjustmentNeededPerDay: 2_500 }),
      hasDailyBudgetBase: true,
      isSalaryPendingConfirmation: false,
      remainingUntilPayday: 7,
    })

    expect(hero.variant).toBe('accent')
    expect(hero.eyebrow).toBe('Ajuste chico')
  })
})
