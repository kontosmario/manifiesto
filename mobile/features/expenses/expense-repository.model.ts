import type { PostgrestError } from '@supabase/supabase-js'
import i18n from '@/lib/i18n'

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
  /** True cuando este expense fue creado al registrar un pago sobre un
   *  fijo VENCIDO (next_due_on < current_date al momento del pago).
   *  Surfaced from `expenses.paid_in_arrears` (migración
   *  20260530120000). La UI usa este flag para distinguir el chip
   *  "Incremento con intereses" del de "Aumento de precio" cuando el
   *  trend delta es positivo. Optional + default false en raw para
   *  tolerar payloads pre-migración del snapshot (DB default es false). */
  paid_in_arrears?: boolean | null
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
  /** Cuando es true, excluye los expenses archivados (`archived_at` no-null,
   *  que `close_monthly_cycle` setea al cerrar el ciclo). Lo usa el feed
   *  reciente del Home/Gastos para no mostrar gastos del ciclo anterior —
   *  bug 2026-06-23: el refetch de `loadExpenses` los traía transitoriamente
   *  (no filtraba archived) hasta que el re-seed del `home_snapshot` —que sí
   *  filtra archived— los borraba, de ahí el "se resetea al refrescar". */
  excludeArchived?: boolean
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
  /** True cuando este expense fue creado al registrar un pago sobre un
   *  fijo VENCIDO. Default false (mayoría de expenses no son de fijos
   *  vencidos). Ver `RawExpense.paid_in_arrears` para detalles. */
  paid_in_arrears: boolean
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
  /**
   * Suprime el toast de "Reintentar" del `onError` de `useCreateExpense`.
   *
   * Ese toast reintenta por un camino PROPIO (`ref.current.mutate(input)`) que
   * no pasa por el guard de doble submit de quien llamó ni cierra su pantalla.
   * En el wizard de alta eso permitía: falla por red → el usuario reintenta
   * desde el toast (se guarda, se manda el push) → la hoja sigue abierta en el
   * paso 2 diciendo que falló → toca "Confirmar" → DOS gastos con el mismo
   * monto y la misma descripción. Los flujos que manejan el error con su
   * propio reintento (el CTA del paso 2) pasan `true`.
   *
   * Espejo de `CreateIncomeEventInput.skipRetryToast` — el mismo agujero se
   * cerró primero en el alta de ingreso.
   */
  skipRetryToast?: boolean
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
    throw new Error(i18n.t('gastos:errors.descriptionRequired'))
  }
  if (normalizedDescription.length > EXPENSE_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      i18n.t('gastos:errors.descriptionTooLong', { max: EXPENSE_DESCRIPTION_MAX_LENGTH }),
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
      i18n.t('gastos:errors.noteTooLong', { max: EXPENSE_NOTES_MAX_LENGTH }),
    )
  }
  return trimmed
}

export function validateExpensePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(i18n.t('gastos:errors.priceInvalid'))
  }
  if (price > EXPENSE_PRICE_MAX) {
    throw new Error(i18n.t('gastos:errors.priceTooHigh'))
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
