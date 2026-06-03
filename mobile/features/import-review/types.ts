import type { Transaction } from '@/features/activity-ocr/types'

export type ReviewRowKind = 'expense' | 'income' | 'skip'

export type ReviewRowWarning =
  | 'foreign-currency'
  | 'swap-ambiguous'
  | 'no-merchant'
  | 'no-date'
  | 'value-zero'

export type IncomeKind = 'transfer' | 'bonus' | 'gift' | 'other'

export interface ReviewRow {
  id: string
  kind: ReviewRowKind
  amount: number
  description: string
  date: string
  notes: string | null
  categoryId: string | null
  incomeKind: IncomeKind
  warnings: ReviewRowWarning[]
  source: {
    transaction: Transaction
    originalCurrency: string
    appliedRate: number | null
  }
}

export interface ReviewState {
  rows: ReviewRow[]
  unmatched: number
  imageUri: string
}

export interface ConfirmFailure {
  rowId: string
  description: string
  reason: string
}

export interface ConfirmResult {
  insertedExpenses: number
  insertedIncomes: number
  skipped: number
  failed: ConfirmFailure[]
}
