import type { Expense } from '@/features/expenses/use-expenses'

export interface BreakdownEntry {
  color: string
  label: string
  total: number
}

export interface ExpenseDaySection {
  data: Expense[]
  key: string
  label: string
  total: number
}

export interface ExpenseHistorySnapshot {
  breakdown: {
    rows: BreakdownEntry[]
    title: string
  }
  filteredExpenses: Expense[]
  filteredTotal: number
  groups: ExpenseDaySection[]
  heroSubtitle: string
}
