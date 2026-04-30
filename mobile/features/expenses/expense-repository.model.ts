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
  /** ISO timestamp inclusive lower bound for `created_at`. When set,
   *  scopes the result to expenses on or after this instant — used by
   *  the cycle-windowed Gastos query so the screen no longer parses
   *  the full family history just to show one cycle. */
  createdAtGte?: string
  /** ISO timestamp exclusive upper bound for `created_at`. Pair with
   *  `createdAtGte` to express a `[start, end)` cycle window. */
  createdAtLt?: string
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

/** Hard cap on description length. Mirror this with a server-side
 *  CHECK constraint when migrating the schema. 200 cubre descripciones
 *  con detalle ("Compra del super en el barrio chino — viandas") sin
 *  permitir abuso (texto pegado de email, etc.). */
export const EXPENSE_DESCRIPTION_MAX_LENGTH = 200

/** Hard cap on price. ARS rara vez supera 8 dígitos en un solo gasto;
 *  el techo de 10⁹ deja headroom para casos extremos sin permitir
 *  overflow del IEEE 754 ni totales nonsensicales. */
export const EXPENSE_PRICE_MAX = 1_000_000_000

export function validateExpenseDescription(description: string) {
  const normalizedDescription = description.trim()
  if (!normalizedDescription) {
    throw new Error('La descripción es obligatoria.')
  }
  if (normalizedDescription.length > EXPENSE_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `La descripción no puede superar los ${EXPENSE_DESCRIPTION_MAX_LENGTH} caracteres.`,
    )
  }
  return normalizedDescription
}

export function validateExpensePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0.')
  }
  if (price > EXPENSE_PRICE_MAX) {
    throw new Error('El precio supera el máximo permitido.')
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
