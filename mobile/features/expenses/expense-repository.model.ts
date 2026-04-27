import type { PostgrestError } from '@supabase/supabase-js'

export interface RawExpense {
  category_id: string
  commitment_id?: string | null
  created_at: string
  created_by: string
  description: string
  family_id: string
  id: string
  price: number | string
}

export interface ProfileRow {
  display_name: string
  id: string
}

export interface ExpenseMonthRow {
  created_at: string
  price: number | string
}

export interface ExpenseQueryFilters {
  categoryId?: string
  limit?: number
}

const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

export interface Expense {
  category_id: string
  commitment_id: string | null
  created_at: string
  created_by: string
  creator_display_name: string
  description: string
  family_id: string
  id: string
  price: number
}

export interface FamilyMonthlySpent {
  monthStartIso: string
  totalSpent: number
}

export interface CreateExpenseInput {
  categoryId: string
  commitmentId?: string | null
  description: string
  price: number
  /**
   * Optional ISO timestamp to back-date the movement (used by the
   * Gastos calendar's "registrar gasto olvidado" flow). When omitted,
   * the DB default `now()` applies — normal flow.
   */
  createdAt?: string | null
}

export interface UpdateExpenseInput {
  description: string
  expenseId: string
  price: number
}

export function isMissingCommitmentIdColumnError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return MISSING_COLUMN_CODES.has(code) && text.includes('commitment_id')
}

export function validateExpenseDescription(description: string) {
  const normalizedDescription = description.trim()
  if (!normalizedDescription) {
    throw new Error('La descripcion es obligatoria.')
  }

  return normalizedDescription
}

export function validateExpensePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('El precio debe ser un numero mayor o igual a 0.')
  }
}

export function buildExpenseInsertPayload({
  categoryId,
  commitmentId,
  createdAt,
  description,
  familyId,
  price,
  userId,
}: {
  categoryId: string
  commitmentId?: string | null
  createdAt?: string | null
  description: string
  familyId: string
  price: number
  userId: string
}) {
  const insertPayload: {
    category_id: string
    commitment_id?: string
    created_at?: string
    created_by: string
    description: string
    family_id: string
    price: number
  } = {
    category_id: categoryId,
    created_by: userId,
    description,
    family_id: familyId,
    price,
  }

  if (typeof commitmentId === 'string' && commitmentId.trim() !== '') {
    insertPayload.commitment_id = commitmentId
  }

  if (typeof createdAt === 'string' && createdAt.trim() !== '') {
    insertPayload.created_at = createdAt
  }

  return insertPayload
}
