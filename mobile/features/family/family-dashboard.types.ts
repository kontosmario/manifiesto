import type { FamilyMonthlySpent } from '@/features/expenses/expense-repository'
import type { FixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-utils'
import type { PayCycle } from '@/utils/pay-cycle'

export interface FamilyDashboardFinanceSnapshot {
  daily_budget_buffer_mode: 'none' | 'fixed' | 'percent'
  daily_budget_buffer_value: number
  daily_budget_checkin_hour: number
  daily_budget_nudges_enabled: boolean
  monthly_income: number
  savings_goal: number
  savings_goal_percent: number
  usd_exchange_rate: number
  salary_payment_day: number
  last_salary_confirmed_at: string | null
  current_cycle_starting_balance: number | null
  current_cycle_anchor: string | null
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
  /**
   * Active per-cycle "starting balance" override. Number when the
   * user has confirmed an adjusted amount for the current cycle;
   * `null` when they kept the default monthly_income (or haven't
   * been asked yet). The daily-budget engine reads this and
   * re-anchors the cycle to today when set.
   */
  cycleStartingBalanceOverride: number | null
  /**
   * The income figure used by every cycle-aware metric in the
   * dashboard (`totalAvailable`, `cycleBalanceBeforeSavings`,
   * `flexibleTargetAmount`, etc.). Equals `cycleStartingBalanceOverride`
   * when active, otherwise falls back to `monthlyIncome`. Surface this
   * in UIs that show "Tu disponible este ciclo" — they should NOT
   * read `monthlyIncome` directly.
   */
  effectiveCycleIncome: number
  /**
   * Effective cycle-length the daily-budget formula divides into.
   * Equals `payCycle.days` without an override; when the user has
   * adjusted the cycle balance, this collapses to the remaining
   * days from today through cycle end (matches the engine).
   */
  effectiveCycleDays: number
  /**
   * `true` when the dashboard should auto-open the cycle balance
   * sheet — i.e., the stored anchor doesn't match the current
   * cycle's anchor target (first-time after onboarding, new payday
   * rolled in, or salary-pending freeze active and not yet
   * confirmed). Stays `true` on every dashboard entry until the
   * user resolves the prompt.
   */
  isCycleStartingBalancePromptPending: boolean
  /**
   * The date the cycle anchor should be persisted against when the
   * user confirms. Equals `payCycle.start` in steady state, but
   * during the salary-pending freeze it pivots to
   * `currentMonthPayDate` (the date the cycle will land on the
   * moment the user confirms) so the prompt doesn't re-fire after
   * the confirm releases the freeze.
   */
  cycleAnchorTarget: Date
}
