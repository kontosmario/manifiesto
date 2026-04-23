import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'

export interface DerivedFixedExpense extends FixedExpense {
  daysUntilDue: number | null
  isDueSoon: boolean
  isDueThisCycle: boolean
  isOverdue: boolean
  paidInCycleAmount: number
  remainingInstallments: number | null
  reservedAmountInCycle: number
  scheduledAmount: number
}

export interface FixedExpenseCycleSummary {
  activeCount: number
  debtBalanceTotal: number
  dueSoonCount: number
  overdueCount: number
  paidInCycleTotal: number
  pressureTotal: number
  reservedTotal: number
  upcomingItems: DerivedFixedExpense[]
  items: DerivedFixedExpense[]
}
