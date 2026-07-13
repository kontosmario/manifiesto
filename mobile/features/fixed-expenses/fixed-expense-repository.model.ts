import type { PostgrestError } from '@supabase/supabase-js'
import i18n from '@/lib/i18n'
import {
  FIXED_EXPENSE_FREQUENCIES,
  FIXED_EXPENSE_KINDS,
  FIXED_EXPENSE_STATUSES,
  type FixedExpense,
  type FixedExpenseFrequency,
  type FixedExpenseKind,
  type FixedExpenseStatus,
} from '@/features/fixed-expenses/fixed-expense-types'

interface RawFixedExpense {
  amount: number | string
  category_id?: string | null
  created_at: string
  day_of_month?: number | string | null
  ends_on?: string | null
  family_id: string
  frequency?: string | null
  id: string
  installments_paid?: number | string | null
  installments_total?: number | string | null
  kind?: string | null
  last_paid_at?: string | null
  lender_name?: string | null
  name: string
  next_due_on?: string | null
  notes?: string | null
  notify_days_before?: number | string | null
  remaining_balance?: number | string | null
  status?: string | null
  updated_at: string
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

export interface UpsertFixedExpenseInput {
  amount: number
  categoryId: string
  dayOfMonth: number
  endsOn?: string | null
  frequency: FixedExpenseFrequency
  installmentsPaid?: number
  installmentsTotal?: number | null
  kind: FixedExpenseKind
  lenderName?: string | null
  name: string
  nextDueOn: string
  notes?: string | null
  notifyDaysBefore?: number | null
  remainingBalance?: number | null
  status?: FixedExpenseStatus
}

export interface UpdateFixedExpenseInput extends UpsertFixedExpenseInput {
  fixedExpenseId: string
}

export function isMissingFixedExpensesTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  )
}

export function isMissingCommitmentColumnsError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_COLUMN_CODES.has(code) &&
    [
      'kind',
      'status',
      'frequency',
      'category_id',
      'next_due_on',
      'day_of_month',
      'ends_on',
      'installments_total',
      'installments_paid',
      'remaining_balance',
      'lender_name',
      'notes',
      'notify_days_before',
      'last_paid_at',
    ].some((columnName) => text.includes(columnName))
  )
}

function parseKind(value: string | null | undefined): FixedExpenseKind {
  return FIXED_EXPENSE_KINDS.find((option) => option === value) ?? 'recurring'
}

function parseStatus(value: string | null | undefined): FixedExpenseStatus {
  return FIXED_EXPENSE_STATUSES.find((option) => option === value) ?? 'active'
}

function parseFrequency(value: string | null | undefined): FixedExpenseFrequency {
  return FIXED_EXPENSE_FREQUENCIES.find((option) => option === value) ?? 'monthly'
}

export function asFixedExpense(row: RawFixedExpense): FixedExpense {
  const fallbackDueDate = new Date().toISOString().slice(0, 10)
  const rawDay = row.day_of_month == null ? NaN : Number(row.day_of_month)
  const fallbackDay =
    typeof row.next_due_on === 'string' && row.next_due_on.trim() !== ''
      ? new Date(row.next_due_on).getUTCDate()
      : 1
  const day_of_month = Number.isFinite(rawDay) && rawDay >= 1 && rawDay <= 31 ? Math.floor(rawDay) : fallbackDay

  return {
    amount: Number(row.amount ?? 0),
    category_id: typeof row.category_id === 'string' && row.category_id.trim() !== '' ? row.category_id : null,
    created_at: row.created_at,
    day_of_month,
    ends_on: typeof row.ends_on === 'string' && row.ends_on.trim() !== '' ? row.ends_on : null,
    family_id: row.family_id,
    frequency: parseFrequency(row.frequency),
    id: row.id,
    installments_paid: Math.max(0, Number(row.installments_paid ?? 0)),
    installments_total:
      row.installments_total == null ? null : Math.max(1, Number(row.installments_total)),
    kind: parseKind(row.kind),
    last_paid_at:
      typeof row.last_paid_at === 'string' && row.last_paid_at.trim() !== '' ? row.last_paid_at : null,
    lender_name:
      typeof row.lender_name === 'string' && row.lender_name.trim() !== '' ? row.lender_name : null,
    name: row.name,
    next_due_on:
      typeof row.next_due_on === 'string' && row.next_due_on.trim() !== ''
        ? row.next_due_on
        : fallbackDueDate,
    notes: typeof row.notes === 'string' && row.notes.trim() !== '' ? row.notes : null,
    notify_days_before:
      row.notify_days_before == null
        ? null
        : Math.max(0, Math.min(30, Math.floor(Number(row.notify_days_before)))),
    remaining_balance:
      row.remaining_balance == null ? null : Math.max(0, Number(row.remaining_balance)),
    status: parseStatus(row.status),
    updated_at: row.updated_at,
  }
}

/**
 * Thrown when a create/rename collides with the `UNIQUE(family_id, name)`
 * constraint on `fixed_expenses` (Postgres 23505). Typed so the UI can show a
 * clear "name taken" message and, crucially, NOT offer a blind retry — resending
 * the same name can only 409 again.
 */
export class FixedExpenseNameTakenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixedExpenseNameTakenError'
  }
}

/**
 * Thrown by the write repository when an action targets a fijo that is still
 * optimistic (a `temp-` id, not yet persisted). Retrying with the same id is
 * futile until the create round-trip lands, so the UI shows the message without
 * a retry affordance.
 */
export class FixedExpenseNotPersistedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixedExpenseNotPersistedError'
  }
}

/**
 * Errors for which re-sending the identical payload can only fail the same way
 * — a duplicate name 409s again; a not-yet-persisted id trips the guard again.
 * The UI surfaces their (already-translated) message but omits the retry action.
 */
export function isRetryFutileError(
  err: unknown,
): err is FixedExpenseNameTakenError | FixedExpenseNotPersistedError {
  return (
    err instanceof FixedExpenseNameTakenError ||
    err instanceof FixedExpenseNotPersistedError
  )
}

export function isDuplicateNameError(error: PostgrestError): boolean {
  if ((error.code ?? '') !== '23505') return false
  // Scope to the UNIQUE(family_id, name) constraint. Other 23505s flow through
  // this same shared handler — notably record_fixed_expense_payment, whose RPC
  // raises 23505 for an already-recorded payment (NOT a name collision).
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return text.includes('fixed_expenses_family_id_name_key')
}

export function throwMigrationError(error: PostgrestError): never {
  if (isMissingFixedExpensesTableError(error) || isMissingCommitmentColumnsError(error)) {
    throw new Error(i18n.t('fijos:errors.missingMigration'))
  }

  if (isDuplicateNameError(error)) {
    throw new FixedExpenseNameTakenError(i18n.t('fijos:errors.nameAlreadyExists'))
  }

  const parts = [error.message, error.details, error.hint].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )

  throw new Error(parts.length > 0 ? parts.join(' ') : i18n.t('fijos:errors.unexpectedSupabase'))
}

function validateCommonFields(input: {
  amount: number
  categoryId: string
  endsOn?: string | null
  frequency: FixedExpenseFrequency
  kind: FixedExpenseKind
  name: string
  nextDueOn: string
  status: FixedExpenseStatus
}) {
  const normalizedName = input.name.trim()
  if (!normalizedName) {
    throw new Error(i18n.t('fijos:errors.nameEmpty'))
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error(i18n.t('fijos:errors.amountInvalid'))
  }

  if (!input.categoryId.trim()) {
    throw new Error(i18n.t('fijos:errors.categoryRequired'))
  }

  if (!FIXED_EXPENSE_KINDS.includes(input.kind)) {
    throw new Error(i18n.t('fijos:errors.kindInvalid'))
  }

  if (!FIXED_EXPENSE_STATUSES.includes(input.status)) {
    throw new Error(i18n.t('fijos:errors.statusInvalid'))
  }

  if (!FIXED_EXPENSE_FREQUENCIES.includes(input.frequency)) {
    throw new Error(i18n.t('fijos:errors.frequencyInvalid'))
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueOn)) {
    throw new Error(i18n.t('fijos:errors.nextDueInvalid'))
  }

  if (input.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) {
    throw new Error(i18n.t('fijos:errors.endsOnInvalid'))
  }

  return normalizedName
}

export function buildFixedExpensePayload({
  allowZeroDebtBalance = false,
  amount,
  categoryId,
  dayOfMonth,
  endsOn = null,
  frequency,
  installmentsPaid = 0,
  installmentsTotal = null,
  kind,
  lenderName = null,
  name,
  nextDueOn,
  notes = null,
  notifyDaysBefore = null,
  remainingBalance = null,
  status = 'active',
}: UpsertFixedExpenseInput & { allowZeroDebtBalance?: boolean }) {
  const normalizedName = validateCommonFields({
    amount,
    categoryId,
    endsOn,
    frequency,
    kind,
    name,
    nextDueOn,
    status,
  })

  if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(i18n.t('fijos:errors.dayOfMonthInvalid'))
  }

  if (kind === 'installment' && (!installmentsTotal || installmentsTotal <= 0)) {
    throw new Error(i18n.t('fijos:errors.installmentsTotalRequired'))
  }

  if (
    kind === 'debt' &&
    (!Number.isFinite(remainingBalance) ||
      Number(remainingBalance) < 0 ||
      (!allowZeroDebtBalance && Number(remainingBalance) === 0))
  ) {
    throw new Error(i18n.t('fijos:errors.debtBalanceRequired'))
  }

  return {
    amount,
    category_id: categoryId.trim(),
    day_of_month: Math.floor(dayOfMonth),
    ends_on: endsOn,
    frequency,
    installments_paid: Math.max(0, installmentsPaid),
    installments_total: kind === 'installment' ? installmentsTotal : null,
    kind,
    lender_name: lenderName?.trim() ? lenderName.trim() : null,
    name: normalizedName,
    next_due_on: nextDueOn,
    notes: notes?.trim() ? notes.trim() : null,
    notify_days_before:
      notifyDaysBefore == null
        ? null
        : Math.max(0, Math.min(30, Math.floor(notifyDaysBefore))),
    remaining_balance: kind === 'debt' ? Number(remainingBalance) : null,
    status,
  }
}
