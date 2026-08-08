import type { Transaction } from '@/features/activity-ocr/types'
import type { PendingCapture } from '@/features/apple-pay-capture/types'
import type { IncomeEventKind } from '@/features/income/use-income-events'

export type ReviewRowKind = 'expense' | 'income' | 'skip'

export type ReviewRowWarning =
  | 'foreign-currency'
  | 'swap-ambiguous'
  | 'no-merchant'
  | 'no-date'
  | 'value-zero'
  // El OCR parseó una fecha futura (imposible para un gasto) → la
  // anclamos a hoy y avisamos al usuario que la revise.
  | 'future-date'
  // Apple Pay: monto negativo = devolución, no un gasto. La fila entra
  // en `skip` y el usuario decide.
  | 'refund'

// El import OCR ofrece el catálogo COMPLETO de tipos de ingreso (los 9 de
// `income-kinds.ts`), igual que el picker de add-ingreso.
export type IncomeKind = IncomeEventKind

export type ReviewRowSource =
  | {
      origin: 'ocr'
      transaction: Transaction
      originalCurrency: string
      appliedRate: number | null
    }
  | {
      origin: 'apple-pay'
      capture: PendingCapture
    }

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
  source: ReviewRowSource
}

export interface ReviewState {
  rows: ReviewRow[]
  unmatched: number
  /** Ausente cuando el origen no es una imagen (p. ej. Apple Pay). */
  imageUri?: string
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
