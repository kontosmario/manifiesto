import type { Expense } from '@/features/expenses/use-expenses'
import type { PayCycle } from '@/utils/pay-cycle'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'
import {
  clamp,
  getFixedExpenseScheduledAmount,
  parseFixedExpenseDate,
} from '@/features/fixed-expenses/commitment-date-utils'
import type {
  DerivedFixedExpense,
  FixedExpenseCycleSummary,
} from '@/features/fixed-expenses/commitment-types'
import type { FixedExpense } from './fixed-expense-types'

import { DAY_MS } from "@/utils/time"

function isCommitmentActive(status: FixedExpense['status']) {
  return status === 'active'
}

function isExpenseInCycle(expense: Pick<Expense, 'created_at'>, payCycle: PayCycle) {
  const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
  if (Number.isNaN(expenseDate.getTime())) {
    return false
  }

  return expenseDate >= payCycle.start && expenseDate < payCycle.end
}

function diffDays(start: Date, end: Date) {
  return Math.round(
    (normalizeToStartOfDay(end).getTime() - normalizeToStartOfDay(start).getTime()) / DAY_MS,
  )
}

function buildPaidInCycleByCommitment(expenses: Expense[], payCycle: PayCycle) {
  return expenses.reduce((totals, expense) => {
    if (!expense.commitment_id || !isExpenseInCycle(expense, payCycle)) {
      return totals
    }

    totals.set(expense.commitment_id, (totals.get(expense.commitment_id) ?? 0) + expense.price)
    return totals
  }, new Map<string, number>())
}

function deriveFixedExpenseFromPaidAmount(
  item: FixedExpense,
  payCycle: PayCycle,
  today: Date,
  paidInCycleAmount: number,
): DerivedFixedExpense {
  const nextDueDate = parseFixedExpenseDate(item.next_due_on)
  const safeToday = normalizeToStartOfDay(today)
  const scheduledAmount = getFixedExpenseScheduledAmount(item)
  const isDueThisCycle =
    isCommitmentActive(item.status) && nextDueDate ? nextDueDate < payCycle.end : false
  const reservedAmountInCycle = isDueThisCycle ? clamp(scheduledAmount - paidInCycleAmount) : 0
  const daysUntilDue = nextDueDate ? diffDays(safeToday, nextDueDate) : null
  const isOverdue =
    isDueThisCycle && nextDueDate ? nextDueDate < safeToday && reservedAmountInCycle > 0 : false
  const isDueSoon =
    isDueThisCycle &&
    reservedAmountInCycle > 0 &&
    typeof daysUntilDue === 'number' &&
    daysUntilDue >= 0 &&
    daysUntilDue <= 5
  const remainingInstallments =
    typeof item.installments_total === 'number'
      ? Math.max(0, item.installments_total - item.installments_paid)
      : null

  return {
    ...item,
    daysUntilDue,
    isDueSoon,
    isDueThisCycle,
    isOverdue,
    paidInCycleAmount,
    remainingInstallments,
    reservedAmountInCycle,
    scheduledAmount,
  }
}

export function deriveFixedExpense(
  item: FixedExpense,
  expenses: Expense[],
  payCycle: PayCycle,
  today: Date,
): DerivedFixedExpense {
  const paidInCycleByCommitment = buildPaidInCycleByCommitment(expenses, payCycle)

  return deriveFixedExpenseFromPaidAmount(
    item,
    payCycle,
    today,
    paidInCycleByCommitment.get(item.id) ?? 0,
  )
}

export function computeFixedExpenseCycleSummary({
  items,
  expenses,
  payCycle,
  today,
}: {
  items: FixedExpense[]
  expenses: Expense[]
  payCycle: PayCycle
  today: Date
}): FixedExpenseCycleSummary {
  const paidInCycleByCommitment = buildPaidInCycleByCommitment(expenses, payCycle)
  const derivedItems = items
    .map((item) =>
      deriveFixedExpenseFromPaidAmount(
        item,
        payCycle,
        today,
        paidInCycleByCommitment.get(item.id) ?? 0,
      ),
    )
    .sort((first, second) => {
      const firstDue = parseFixedExpenseDate(first.next_due_on)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const secondDue =
        parseFixedExpenseDate(second.next_due_on)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return firstDue - secondDue
    })

  const paidInCycleTotal = derivedItems.reduce((sum, item) => sum + item.paidInCycleAmount, 0)
  const reservedTotal = derivedItems.reduce((sum, item) => sum + item.reservedAmountInCycle, 0)
  const debtBalanceTotal = derivedItems.reduce(
    (sum, item) => sum + clamp(item.remaining_balance ?? 0),
    0,
  )

  return {
    activeCount: derivedItems.filter((item) => item.status === 'active').length,
    debtBalanceTotal,
    dueSoonCount: derivedItems.filter((item) => item.isDueSoon).length,
    overdueCount: derivedItems.filter((item) => item.isOverdue).length,
    paidInCycleTotal,
    pressureTotal: paidInCycleTotal + reservedTotal,
    reservedTotal,
    upcomingItems: derivedItems.filter(
      (item) => item.status === 'active' && (item.isOverdue || item.isDueSoon || item.isDueThisCycle),
    ),
    items: derivedItems,
  }
}
