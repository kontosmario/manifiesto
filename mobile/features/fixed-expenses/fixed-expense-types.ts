export const FIXED_EXPENSE_KINDS = ['recurring', 'periodic', 'installment', 'debt'] as const
export type FixedExpenseKind = (typeof FIXED_EXPENSE_KINDS)[number]

export const FIXED_EXPENSE_STATUSES = ['active', 'paused', 'completed', 'archived'] as const
export type FixedExpenseStatus = (typeof FIXED_EXPENSE_STATUSES)[number]

export const FIXED_EXPENSE_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
] as const
export type FixedExpenseFrequency = (typeof FIXED_EXPENSE_FREQUENCIES)[number]

export interface FixedExpense {
  id: string
  family_id: string
  name: string
  amount: number
  kind: FixedExpenseKind
  status: FixedExpenseStatus
  frequency: FixedExpenseFrequency
  category_id: string | null
  next_due_on: string
  ends_on: string | null
  installments_total: number | null
  installments_paid: number
  remaining_balance: number | null
  lender_name: string | null
  notes: string | null
  last_paid_at: string | null
  created_at: string
  updated_at: string
}

export function fixedExpenseKindLabel(kind: FixedExpenseKind): string {
  switch (kind) {
    case 'periodic':
      return 'Periódico'
    case 'installment':
      return 'Cuotas'
    case 'debt':
      return 'Deuda'
    default:
      return 'Recurrente'
  }
}

export function fixedExpenseStatusLabel(status: FixedExpenseStatus): string {
  switch (status) {
    case 'paused':
      return 'Pausado'
    case 'completed':
      return 'Completado'
    case 'archived':
      return 'Archivado'
    default:
      return 'Activo'
  }
}

export function fixedExpenseFrequencyLabel(frequency: FixedExpenseFrequency): string {
  switch (frequency) {
    case 'weekly':
      return 'Semanal'
    case 'biweekly':
      return 'Quincenal'
    case 'quarterly':
      return 'Trimestral'
    case 'semiannual':
      return 'Semestral'
    case 'annual':
      return 'Anual'
    default:
      return 'Mensual'
  }
}
