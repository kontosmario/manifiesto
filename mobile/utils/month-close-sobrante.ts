import type { Expense } from '@/features/expenses/expense-repository.model'

export interface MonthCloseSobranteInput {
  lastMonthStart: Date
  /** Exclusive — first instant outside the window. */
  lastMonthEnd: Date
  monthlyIncome: number
  expenses: Expense[]
  /** Aportes a meta hechos durante el mes pasado. V1: 0 (no se trackea). */
  savingsContributedThisMonth: number
}

/**
 * Sobrante = monthly_income - gastos_del_mes - savings_aportados.
 * Clampeado a >= 0 (no se promptea cuando cerraste en rojo).
 *
 * Spec: month-close leftover decision (Spec B).
 */
export function computeMonthCloseSobrante(input: MonthCloseSobranteInput): number {
  const startMs = input.lastMonthStart.getTime()
  const endMs = input.lastMonthEnd.getTime()
  const gastos = input.expenses.reduce((acc, expense) => {
    const t = new Date(expense.created_at).getTime()
    if (t >= startMs && t < endMs) {
      return acc + Number(expense.price)
    }
    return acc
  }, 0)
  return Math.max(0, input.monthlyIncome - gastos - input.savingsContributedThisMonth)
}
