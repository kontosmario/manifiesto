import type { Expense } from '@/features/expenses/use-expenses'
import {
  deriveSavingsGoalPercent,
  resolveFlexibleTargetPercent,
  TARGET_ESSENTIALS_PERCENT,
} from '@/features/finance/family-finance.model'
import {
  buildMonthlyHistoryRows,
  buildMonthlyHistoryTotals,
} from '@/features/family/family-dashboard-monthly-history'
import type {
  FamilyDashboardFinanceSnapshot,
  FamilyDashboardMonthlyHistoryRow,
  FamilyDashboardMonthlyHistoryTotals,
  FamilyDashboardSnapshot,
} from '@/features/family/family-dashboard.types'
import {
  computeFixedExpenseCycleSummary,
} from '@/features/fixed-expenses/commitment-utils'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import {
  buildPayDate,
  getCurrentPayCycle,
  normalizeToStartOfDay,
} from '@/utils/pay-cycle'
const DEFAULT_SALARY_PAYMENT_DAY = 1
const DEFAULT_USD_EXCHANGE_RATE = 1000

function derivePercentAmount(total: number, percent: number) {
  if (!Number.isFinite(total) || total <= 0) {
    return 0
  }

  if (!Number.isFinite(percent) || percent <= 0) {
    return 0
  }

  return Math.round(((total * percent) / 100) * 100) / 100
}

interface BuildFamilyDashboardSnapshotInput {
  commitments?: FixedExpense[]
  expenses?: Expense[]
  finance?: FamilyDashboardFinanceSnapshot | null
  monthsBack?: number
  today?: Date
}

function parseConfirmedDate(value?: string | null): Date | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return normalizeToStartOfDay(parsedDate)
}

export function buildFamilyDashboardSnapshot({
  commitments = [],
  expenses = [],
  finance,
  monthsBack = 6,
  today = new Date(),
}: BuildFamilyDashboardSnapshotInput): FamilyDashboardSnapshot {
  const todayDate = normalizeToStartOfDay(today)
  const salaryPaymentDay = finance?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY
  const currentMonthPayDate = buildPayDate(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    salaryPaymentDay,
  )
  const lastSalaryConfirmedDate = parseConfirmedDate(finance?.last_salary_confirmed_at ?? null)
  const isSalaryPendingConfirmation =
    todayDate >= currentMonthPayDate &&
    (!lastSalaryConfirmedDate || lastSalaryConfirmedDate < currentMonthPayDate)
  const payCycle = getCurrentPayCycle(todayDate, salaryPaymentDay, isSalaryPendingConfirmation)

  const currentMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  const nextMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1)
  const firstMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - (Math.max(1, Math.floor(monthsBack)) - 1),
    1,
  )

  let totalGeneral = 0
  let actualSpentInCurrentCycle = 0
  let variableSpentInCurrentCycle = 0
  let commitmentPaymentsInCurrentCycle = 0
  const monthlyTotalsByMonth = new Map<string, number>()

  expenses.forEach((expense) => {
    totalGeneral += expense.price

    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    if (Number.isNaN(expenseDate.getTime())) {
      return
    }

    if (expenseDate >= payCycle.start && expenseDate < payCycle.end) {
      actualSpentInCurrentCycle += expense.price
      if (expense.commitment_id) {
        commitmentPaymentsInCurrentCycle += expense.price
      } else {
        variableSpentInCurrentCycle += expense.price
      }
    }

    if (expenseDate >= firstMonthStart && expenseDate < nextMonthStart) {
      const monthStart = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), 1)
      const monthKey = monthStart.toISOString()
      const previousTotal = monthlyTotalsByMonth.get(monthKey) ?? 0
      monthlyTotalsByMonth.set(monthKey, previousTotal + expense.price)
    }
  })

  const currentCycleCommitmentSummary = computeFixedExpenseCycleSummary({
    items: commitments,
    expenses,
    payCycle,
    today: todayDate,
  })
  const monthlyIncome = finance?.monthly_income ?? 0
  const savingsGoal = finance?.savings_goal ?? 0
  const savingsGoalPercent =
    typeof finance?.savings_goal_percent === 'number'
      ? finance.savings_goal_percent
      : deriveSavingsGoalPercent({
          monthlyIncome,
          savingsGoal,
        })
  const targetFlexiblePercent = resolveFlexibleTargetPercent(savingsGoalPercent)
  const flexibleTargetAmount = derivePercentAmount(monthlyIncome, targetFlexiblePercent)
  const commitmentPressureInCurrentCycle = currentCycleCommitmentSummary.pressureTotal
  const cycleBalanceBeforeSavings =
    monthlyIncome - savingsGoal - commitmentPressureInCurrentCycle - variableSpentInCurrentCycle
  const savingsSpent = Math.min(savingsGoal, Math.max(0, -cycleBalanceBeforeSavings))
  const savingsRemaining = Math.max(0, savingsGoal - savingsSpent)
  const flexibleDelta = variableSpentInCurrentCycle - flexibleTargetAmount
  const flexibleRemaining = Math.max(0, flexibleTargetAmount - variableSpentInCurrentCycle)
  const totalAvailable = cycleBalanceBeforeSavings + savingsSpent
  const monthlyHistory = buildMonthlyHistoryRows(
    monthlyTotalsByMonth,
    monthlyIncome,
    savingsGoal,
    todayDate,
    monthsBack,
  )
  const monthlyHistoryTotals = buildMonthlyHistoryTotals(monthlyHistory)
  const remainingUntilPayday = Math.round(
    (payCycle.end.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
  )

  return {
    actualSpentInCurrentCycle,
    commitmentPaymentsInCurrentCycle,
    commitmentPressureInCurrentCycle,
    currentCycleCommitmentSummary,
    currentMonthPayDate,
    cycleBalanceBeforeSavings,
    dailyBudgetBufferMode: finance?.daily_budget_buffer_mode ?? 'none',
    dailyBudgetBufferValue: finance?.daily_budget_buffer_value ?? 0,
    dailyBudgetCheckinHour: finance?.daily_budget_checkin_hour ?? 9,
    dailyBudgetNudgesEnabled: finance?.daily_budget_nudges_enabled ?? true,
    fixedExpensesMonthlyTotal: commitmentPressureInCurrentCycle,
    flexibleDelta,
    flexibleRemaining,
    flexibleTargetAmount,
    isSalaryPendingConfirmation,
    monthlyHistory,
    monthlyHistoryTotals,
    monthlyIncome,
    payCycle,
    remainingUntilPayday,
    salaryPaymentDay,
    savingsGoal,
    savingsGoalPercent,
    savingsRemaining,
    savingsSpent,
    spentInCurrentCycle: variableSpentInCurrentCycle,
    targetEssentialsPercent: TARGET_ESSENTIALS_PERCENT,
    targetFlexiblePercent,
    todayDate,
    totalAvailable,
    totalGeneral,
    usdExchangeRate: finance?.usd_exchange_rate ?? DEFAULT_USD_EXCHANGE_RATE,
    variableSpentInCurrentCycle,
  }
}

export type {
  FamilyDashboardFinanceSnapshot,
  FamilyDashboardMonthlyHistoryRow,
  FamilyDashboardMonthlyHistoryTotals,
  FamilyDashboardSnapshot,
}
