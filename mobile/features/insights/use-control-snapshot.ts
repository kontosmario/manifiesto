import { useMemo } from 'react'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { computeDailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import { computeExpenseAnalytics } from '@/features/expenses/expense-analytics'
import { type Expense } from '@/features/expenses/use-expenses'
import { buildHeroMetrics, buildTodayMetrics } from '@/features/insights/control-metric-groups'
import {
  buildControlMood,
  buildCyclePlanActions,
  buildFocusMetrics,
  buildHeroState,
  buildTodayActions,
} from '@/features/insights/control-model'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'

const EMPTY_EXPENSES: Expense[] = []
const EMPTY_CATEGORIES: Category[] = []

export function useControlSnapshot(familyId: string) {
  const dashboard = useFamilyDashboard(familyId)
  const expensesQuery = dashboard.expensesQuery
  const categoriesQuery = useCategories(familyId)
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const variableExpenses = useMemo(
    () => expenses.filter((expense) => !expense.commitment_id),
    [expenses],
  )
  const history = dashboard.monthlyHistory.slice(0, 6).reverse()
  const commitmentSummary = dashboard.currentCycleCommitmentSummary
  const cyclePressure = dashboard.spentInCurrentCycle + dashboard.fixedExpensesMonthlyTotal
  const isOverviewLoading =
    dashboard.familyFinanceQuery.isLoading || expensesQuery.isLoading
  const isIntelligenceLoading = isOverviewLoading || categoriesQuery.isLoading

  const dailyBudgetSummary = useMemo(() => {
    return computeDailyBudgetSummary({
      bufferMode: dashboard.dailyBudgetBufferMode,
      bufferValue: dashboard.dailyBudgetBufferValue,
      expenses: variableExpenses,
      fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
      monthlyIncome: dashboard.monthlyIncome,
      payCycle: dashboard.payCycle,
      savingsGoal: dashboard.savingsGoal,
      today: dashboard.todayDate,
    })
  }, [
    dashboard.dailyBudgetBufferMode,
    dashboard.dailyBudgetBufferValue,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.monthlyIncome,
    dashboard.payCycle,
    dashboard.savingsGoal,
    dashboard.todayDate,
    variableExpenses,
  ])

  const expenseAnalytics = useMemo(() => {
    if (variableExpenses.length === 0) {
      return null
    }

    return computeExpenseAnalytics({
      categories,
      expenses: variableExpenses,
      payCycle: dashboard.payCycle,
      spentInCurrentCycle: dashboard.spentInCurrentCycle,
      today: dashboard.todayDate,
      totalAvailable: dashboard.totalAvailable,
    })
  }, [
    categories,
    dashboard.payCycle,
    dashboard.spentInCurrentCycle,
    dashboard.todayDate,
    dashboard.totalAvailable,
    variableExpenses,
  ])

  const hasDailyBudgetBase = dashboard.monthlyIncome > 0
  const projectedCloseValue =
    expenseAnalytics?.projectedAvailableAtCycleEnd ?? dashboard.totalAvailable
  const heroState = useMemo(
    () =>
      buildHeroState({
        commitmentSummary,
        dailyBudgetSummary,
        expenseAnalytics,
        hasDailyBudgetBase,
        isSalaryPendingConfirmation: dashboard.isSalaryPendingConfirmation,
        remainingUntilPayday: dashboard.remainingUntilPayday,
      }),
    [
      commitmentSummary,
      dailyBudgetSummary,
      dashboard.isSalaryPendingConfirmation,
      dashboard.remainingUntilPayday,
      expenseAnalytics,
      hasDailyBudgetBase,
    ],
  )
  const controlMood = useMemo(
    () =>
      buildControlMood({
        commitmentSummary,
        dailyBudgetSummary,
        expenseAnalytics,
        hasDailyBudgetBase,
        isSalaryPendingConfirmation: dashboard.isSalaryPendingConfirmation,
      }),
    [
      commitmentSummary,
      dailyBudgetSummary,
      dashboard.isSalaryPendingConfirmation,
      expenseAnalytics,
      hasDailyBudgetBase,
    ],
  )
  const todayActions = useMemo(
    () =>
      buildTodayActions({
        commitmentSummary,
        dailyBudgetSummary,
        expenseAnalytics,
        flexibleDelta: dashboard.flexibleDelta,
        flexibleTargetAmount: dashboard.flexibleTargetAmount,
        hasDailyBudgetBase,
        isSalaryPendingConfirmation: dashboard.isSalaryPendingConfirmation,
        savingsGoal: dashboard.savingsGoal,
        savingsGoalPercent: dashboard.savingsGoalPercent,
        savingsRemaining: dashboard.savingsRemaining,
        targetFlexiblePercent: dashboard.targetFlexiblePercent,
        variableSpentInCurrentCycle: dashboard.variableSpentInCurrentCycle,
      }),
    [
      commitmentSummary,
      dailyBudgetSummary,
      dashboard.flexibleDelta,
      dashboard.flexibleTargetAmount,
      dashboard.isSalaryPendingConfirmation,
      dashboard.savingsGoal,
      dashboard.savingsGoalPercent,
      dashboard.savingsRemaining,
      dashboard.targetFlexiblePercent,
      dashboard.variableSpentInCurrentCycle,
      expenseAnalytics,
      hasDailyBudgetBase,
    ],
  )
  const cyclePlanActions = useMemo(
    () =>
      buildCyclePlanActions({
        commitmentSummary,
        dailyBudgetSummary,
        expenseAnalytics,
        hasDailyBudgetBase,
      }),
    [commitmentSummary, dailyBudgetSummary, expenseAnalytics, hasDailyBudgetBase],
  )
  const focusMetrics = useMemo(
    () =>
      buildFocusMetrics({
        commitmentSummary,
        expenseAnalytics,
      }),
    [commitmentSummary, expenseAnalytics],
  )

  const heroMetrics = useMemo(
    () =>
      buildHeroMetrics({
        commitmentSummary,
        dailyBudgetSummary,
        flexibleDelta: dashboard.flexibleDelta,
        flexibleTargetAmount: dashboard.flexibleTargetAmount,
        hasDailyBudgetBase,
        remainingUntilPayday: dashboard.remainingUntilPayday,
        savingsGoalPercent: dashboard.savingsGoalPercent,
        targetFlexiblePercent: dashboard.targetFlexiblePercent,
        variableSpentInCurrentCycle: dashboard.variableSpentInCurrentCycle,
      }),
    [
      commitmentSummary,
      dailyBudgetSummary,
      dashboard.flexibleDelta,
      dashboard.flexibleTargetAmount,
      dashboard.remainingUntilPayday,
      dashboard.savingsGoalPercent,
      dashboard.targetFlexiblePercent,
      dashboard.variableSpentInCurrentCycle,
      hasDailyBudgetBase,
    ],
  )

  const todayMetrics = useMemo(
    () =>
      buildTodayMetrics({
        dailyBudgetSummary,
        expenseAnalytics,
        hasDailyBudgetBase,
      }),
    [dailyBudgetSummary, expenseAnalytics, hasDailyBudgetBase],
  )

  return {
    categories,
    categoriesQuery,
    commitmentSummary,
    controlMood,
    cyclePlanActions,
    cyclePressure,
    dailyBudgetSummary,
    dashboard,
    expenseAnalytics,
    expensesQuery,
    hasDailyBudgetBase,
    heroMetrics,
    heroState,
    history,
    isIntelligenceLoading,
    isOverviewLoading,
    projectedCloseValue,
    todayActions,
    todayMetrics,
    focusMetrics,
  }
}
