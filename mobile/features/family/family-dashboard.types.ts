import type { FamilyMonthlySpent } from '@/features/expenses/use-expenses'
import type { FixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-utils'
import type { PayCycle } from '@/utils/pay-cycle'

export interface FamilyDashboardFinanceSnapshot {
  daily_budget_buffer_mode: 'none' | 'fixed' | 'percent'
  daily_budget_buffer_value: number
  daily_budget_checkin_hour: number
  daily_budget_nudges_enabled: boolean
  essential_monthly_cost: number
  monthly_income: number
  savings_goal: number
  savings_goal_percent: number
  usd_exchange_rate: number
  salary_payment_day: number
  last_salary_confirmed_at: string | null
}

export interface FamilyDashboardMonthlyHistoryRow extends FamilyMonthlySpent {
  fixedSpent: number
  spent: number
  saved: number
  goalSpent: number
  endBalance: number
  monthLabel: string
}

export interface FamilyDashboardMonthlyHistoryTotals {
  totalSpent: number
  totalSaved: number
  totalGoalSpent: number
}

export interface FamilyDashboardSnapshot {
  actualSpentInCurrentCycle: number
  commitmentPaymentsInCurrentCycle: number
  commitmentPressureInCurrentCycle: number
  currentCycleCommitmentSummary: FixedExpenseCycleSummary
  currentMonthPayDate: Date
  cycleBalanceBeforeSavings: number
  dailyBudgetBufferMode: FamilyDashboardFinanceSnapshot['daily_budget_buffer_mode']
  dailyBudgetBufferValue: number
  dailyBudgetCheckinHour: number
  dailyBudgetNudgesEnabled: boolean
  fixedExpensesMonthlyTotal: number
  flexibleDelta: number
  flexibleRemaining: number
  flexibleTargetAmount: number
  isSalaryPendingConfirmation: boolean
  monthlyHistory: FamilyDashboardMonthlyHistoryRow[]
  monthlyHistoryTotals: FamilyDashboardMonthlyHistoryTotals
  monthlyIncome: number
  payCycle: PayCycle
  remainingUntilPayday: number
  salaryPaymentDay: number
  savingsGoal: number
  savingsGoalPercent: number
  savingsRemaining: number
  savingsSpent: number
  spentInCurrentCycle: number
  targetEssentialsPercent: number
  targetFlexiblePercent: number
  todayDate: Date
  totalAvailable: number
  totalGeneral: number
  usdExchangeRate: number
  variableSpentInCurrentCycle: number
}
