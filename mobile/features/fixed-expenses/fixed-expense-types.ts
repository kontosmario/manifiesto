import i18n from '@/lib/i18n'

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
  /** 1..31 — anchor for month-based frequencies, survives short months. */
  day_of_month: number
  ends_on: string | null
  installments_total: number | null
  installments_paid: number
  remaining_balance: number | null
  lender_name: string | null
  notes: string | null
  /** Days before next_due_on to fire a reminder. Null disables it. */
  notify_days_before: number | null
  last_paid_at: string | null
  created_at: string
  updated_at: string
}

export function fixedExpenseKindLabel(kind: FixedExpenseKind): string {
  switch (kind) {
    case 'periodic':
      return i18n.t('fijos:kind.periodic')
    case 'installment':
      return i18n.t('fijos:kind.installment')
    case 'debt':
      return i18n.t('fijos:kind.debt')
    default:
      return i18n.t('fijos:kind.recurring')
  }
}

export function fixedExpenseStatusLabel(status: FixedExpenseStatus): string {
  switch (status) {
    case 'paused':
      return i18n.t('fijos:kindStatus.paused')
    case 'completed':
      return i18n.t('fijos:kindStatus.completed')
    case 'archived':
      return i18n.t('fijos:kindStatus.archived')
    default:
      return i18n.t('fijos:kindStatus.active')
  }
}

export function fixedExpenseFrequencyLabel(frequency: FixedExpenseFrequency): string {
  switch (frequency) {
    case 'weekly':
      return i18n.t('fijos:frequency.weekly')
    case 'biweekly':
      return i18n.t('fijos:frequency.biweekly')
    case 'quarterly':
      return i18n.t('fijos:frequency.quarterly')
    case 'semiannual':
      return i18n.t('fijos:frequency.semiannual')
    case 'annual':
      return i18n.t('fijos:frequency.annual')
    default:
      return i18n.t('fijos:frequency.monthly')
  }
}
