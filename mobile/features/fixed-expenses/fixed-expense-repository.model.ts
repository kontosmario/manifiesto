import type { PostgrestError } from '@supabase/supabase-js'
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
  remaining_balance?: number | string | null
  status?: string | null
  updated_at: string
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

export interface UpsertFixedExpenseInput {
  amount: number
  categoryId: string
  endsOn?: string | null
  frequency: FixedExpenseFrequency
  installmentsPaid?: number
  installmentsTotal?: number | null
  kind: FixedExpenseKind
  lenderName?: string | null
  name: string
  nextDueOn: string
  notes?: string | null
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
      'ends_on',
      'installments_total',
      'installments_paid',
      'remaining_balance',
      'lender_name',
      'notes',
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

  return {
    amount: Number(row.amount ?? 0),
    category_id: typeof row.category_id === 'string' && row.category_id.trim() !== '' ? row.category_id : null,
    created_at: row.created_at,
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
    remaining_balance:
      row.remaining_balance == null ? null : Math.max(0, Number(row.remaining_balance)),
    status: parseStatus(row.status),
    updated_at: row.updated_at,
  }
}

export function throwMigrationError(error: PostgrestError): never {
  if (isMissingFixedExpensesTableError(error) || isMissingCommitmentColumnsError(error)) {
    throw new Error('Falta correr la migracion SQL para habilitar Gastos Fijos.')
  }

  const parts = [error.message, error.details, error.hint].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )

  throw new Error(parts.length > 0 ? parts.join(' ') : 'Ocurrio un error inesperado en Supabase.')
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
    throw new Error('El nombre del gasto fijo no puede estar vacio.')
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto del gasto fijo debe ser valido (> 0).')
  }

  if (!input.categoryId.trim()) {
    throw new Error('Elegi una categoria para poder integrar el pago al historial.')
  }

  if (!FIXED_EXPENSE_KINDS.includes(input.kind)) {
    throw new Error('Tipo de gasto fijo invalido.')
  }

  if (!FIXED_EXPENSE_STATUSES.includes(input.status)) {
    throw new Error('Estado de gasto fijo invalido.')
  }

  if (!FIXED_EXPENSE_FREQUENCIES.includes(input.frequency)) {
    throw new Error('Frecuencia invalida.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueOn)) {
    throw new Error('Defini una fecha de proximo vencimiento valida.')
  }

  if (input.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) {
    throw new Error('La fecha de fin no es valida.')
  }

  return normalizedName
}

export function buildFixedExpensePayload({
  allowZeroDebtBalance = false,
  amount,
  categoryId,
  endsOn = null,
  frequency,
  installmentsPaid = 0,
  installmentsTotal = null,
  kind,
  lenderName = null,
  name,
  nextDueOn,
  notes = null,
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

  if (kind === 'installment' && (!installmentsTotal || installmentsTotal <= 0)) {
    throw new Error('Defini la cantidad total de cuotas.')
  }

  if (
    kind === 'debt' &&
    (!Number.isFinite(remainingBalance) ||
      Number(remainingBalance) < 0 ||
      (!allowZeroDebtBalance && Number(remainingBalance) === 0))
  ) {
    throw new Error('Defini un saldo pendiente valido para la deuda.')
  }

  return {
    amount,
    category_id: categoryId.trim(),
    ends_on: endsOn,
    frequency,
    installments_paid: Math.max(0, installmentsPaid),
    installments_total: kind === 'installment' ? installmentsTotal : null,
    kind,
    lender_name: lenderName?.trim() ? lenderName.trim() : null,
    name: normalizedName,
    next_due_on: nextDueOn,
    notes: notes?.trim() ? notes.trim() : null,
    remaining_balance: kind === 'debt' ? Number(remainingBalance) : null,
    status,
  }
}
