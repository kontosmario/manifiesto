import type { PostgrestError } from '@supabase/supabase-js'

export interface RawExpense {
  category_id: string
  commitment_id?: string | null
  created_at: string
  created_by: string
  description: string
  /** Optional free-form context the user added when logging the
   *  expense (max 500 chars; null when blank). Surfaced from
   *  `expenses.notes` since migration 20260519000000. */
  notes?: string | null
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
  /** Optional context attached to this expense (max 500 chars).
   *  `null` when the user didn't add a note. */
  notes: string | null
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
  /** Optional free-form context, up to 500 chars after trim.
   *  Pass `null`/`undefined` (or an empty string) to skip. */
  notes?: string | null
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
  /** Pass `null` to clear an existing note, `undefined` to leave it
   *  untouched, or a string to set/replace it (max 500 after trim). */
  notes?: string | null
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

/** Hard cap on optional notes. Mirrors the server CHECK constraint
 *  `expenses_notes_length_check` from migration 20260519000000.
 *  500 cubre una nota de contexto sin permitir pegar emails enteros. */
export const EXPENSE_NOTES_MAX_LENGTH = 500

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

/**
 * Normaliza la nota opcional:
 *   - undefined / null → null (no la persistimos)
 *   - string vacío después de trim → null (no guardamos "")
 *   - string con contenido → trimmed, validado contra el cap
 */
export function normalizeExpenseNotes(notes: string | null | undefined): string | null {
  if (notes == null) return null
  const trimmed = notes.trim()
  if (!trimmed) return null
  if (trimmed.length > EXPENSE_NOTES_MAX_LENGTH) {
    throw new Error(
      `La nota no puede superar los ${EXPENSE_NOTES_MAX_LENGTH} caracteres.`,
    )
  }
  return trimmed
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
  notes,
  familyId,
  price,
  userId,
}: {
  categoryId: string
  commitmentId?: string | null
  createdAt?: string | null
  description: string
  notes?: string | null
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
    notes?: string
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

  if (typeof notes === 'string' && notes.length > 0) {
    insertPayload.notes = notes
  }

  return insertPayload
}
