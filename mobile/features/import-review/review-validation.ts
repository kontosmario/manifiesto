import i18n from '@/lib/i18n'
import { EXPENSE_PRICE_MAX } from '@/features/expenses/expense-repository.model'
import type { ReviewRow } from './types'

/**
 * Campos requeridos que le faltan a una fila, con nombre legible.
 *
 * Vive en su propio módulo (y no adentro del hook del controller) para que
 * sea puro y testeable: es la ÚNICA definición de "esta fila se puede
 * cargar", y de eso dependen `invalidIds`, `canConfirm`, el CTA primario y
 * el renglón de ayuda del footer.
 *
 * Las filas salteadas están exentas — están explícitamente fuera del insert.
 */
export function missingFieldsForRow(row: ReviewRow): string[] {
  if (row.kind === 'skip') return []
  const missing: string[] = []
  if (row.description.trim() === '') missing.push(i18n.t('gastos:import.field.description'))
  // El tope NO es cosmético: `validateExpensePrice` lo hace explotar en el
  // insert, o sea DESPUÉS de que la hoja se cerró y el usuario ya no puede
  // arreglarlo. Un OCR que lee "1.234.567.890" tiene que frenar acá.
  if (row.amount <= 0 || row.amount > EXPENSE_PRICE_MAX) {
    missing.push(i18n.t('gastos:import.field.amount'))
  }
  if (row.kind === 'expense' && !row.categoryId) missing.push(i18n.t('gastos:import.field.category'))
  return missing
}

/** `true` cuando la fila supera el tope duro de monto del repositorio. */
export function isAmountOverCap(row: ReviewRow): boolean {
  return row.kind !== 'skip' && row.amount > EXPENSE_PRICE_MAX
}

export interface ReviewTotals {
  submittableCount: number
  submittableBreakdown: { expenses: number; incomes: number }
  /** Plata que se va a cargar si se confirma ahora. */
  submittableTotal: number
  /** Plata de TODO lo leído, descartes incluidos — el "de $X leídos". */
  parsedTotal: number
  skippedCount: number
  canConfirm: boolean
  invalidIds: string[]
  firstInvalidId: string | null
}

/**
 * Todo lo derivado del set de filas, en una función PURA — el hook sólo la
 * memoiza. Separado del `useReducer` para que los números que encabezan la
 * bandeja (y de los que depende el CTA) sean testeables sin renderer.
 */
export function deriveReviewTotals(rows: readonly ReviewRow[]): ReviewTotals {
  const submittable = rows.filter((r) => r.kind !== 'skip')
  const invalidIds = submittable
    .filter((r) => missingFieldsForRow(r).length > 0)
    .map((r) => r.id)
  const sum = (list: readonly ReviewRow[]) =>
    list.reduce((acc, r) => acc + Math.abs(r.amount), 0)
  return {
    submittableCount: submittable.length,
    submittableBreakdown: {
      expenses: submittable.filter((r) => r.kind === 'expense').length,
      incomes: submittable.filter((r) => r.kind === 'income').length,
    },
    submittableTotal: sum(submittable),
    parsedTotal: sum(rows),
    skippedCount: rows.length - submittable.length,
    canConfirm: submittable.length > 0 && invalidIds.length === 0,
    invalidIds,
    firstInvalidId: invalidIds[0] ?? null,
  }
}
