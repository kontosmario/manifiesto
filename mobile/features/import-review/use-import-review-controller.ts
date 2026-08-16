import { useCallback, useMemo, useReducer } from 'react'
import type { ReviewRow, ReviewRowKind, ReviewState } from './types'
import { reviewReducer } from './review-reducer'
import { deriveReviewTotals, missingFieldsForRow } from './review-validation'

const EMPTY_STATE: ReviewState = {
  rows: [],
  unmatched: 0,
  imageUri: '',
}

export interface ImportReviewController {
  state: ReviewState
  setRowKind: (id: string, kind: ReviewRowKind) => void
  patchRow: (id: string, patch: Partial<ReviewRow>) => void
  skipRow: (id: string) => void
  unskipRow: (id: string) => void
  removeRow: (id: string) => void
  replaceState: (state: ReviewState) => void
  /** Cuántas rows quedarían insertadas si se confirma ahora. */
  submittableCount: number
  /** Cuántas rows están marcadas skip. */
  skippedCount: number
  /** Breakdown de submittable: gastos vs ingresos. */
  submittableBreakdown: { expenses: number; incomes: number }
  /**
   * Plata que se va a cargar si se confirma ahora (gastos + ingresos, en
   * valor absoluto). El resumen listaba el monto fila por fila y nunca los
   * sumaba: el usuario terminaba nueve pasos de revisión sin saber cuánto
   * movió. Es el número que encabeza la bandeja.
   */
  submittableTotal: number
  /** Plata de TODO lo leído, salteados incluidos — el "de $X leídos". */
  parsedTotal: number
  /** Id de la primera fila incompleta en orden de lista, o null. */
  firstInvalidId: string | null
  /** true cuando hay al menos una row submittable y ninguna invalida. */
  canConfirm: boolean
  /** Invalid IDs entre las submittable: faltan campos requeridos
   *  (descripción, monto > 0, y categoría para gastos). */
  invalidIds: string[]
  /** Returns the human-readable list of missing required fields for a
   *  given row. Used by the wizard footer to tell the user exactly
   *  what's blocking the "Siguiente" button instead of just disabling
   *  it with no explanation. Returns [] for skipped rows and for fully
   *  valid rows. */
  missingFieldsFor: (id: string) => string[]
}

export function useImportReviewController(
  initialState: ReviewState = EMPTY_STATE,
): ImportReviewController {
  const [state, dispatch] = useReducer(reviewReducer, initialState)

  const setRowKind = useCallback((id: string, kind: ReviewRowKind) => {
    dispatch({ type: 'SET_KIND', id, kind })
  }, [])

  const patchRow = useCallback((id: string, patch: Partial<ReviewRow>) => {
    dispatch({ type: 'PATCH_ROW', id, patch })
  }, [])

  const skipRow = useCallback((id: string) => {
    dispatch({ type: 'SKIP_ROW', id })
  }, [])

  const unskipRow = useCallback((id: string) => {
    dispatch({ type: 'UNSKIP_ROW', id })
  }, [])

  const removeRow = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ROW', id })
  }, [])

  const replaceState = useCallback((next: ReviewState) => {
    dispatch({ type: 'REPLACE', state: next })
  }, [])

  // Todo lo derivado vive en un módulo puro; el hook sólo lo memoiza.
  const derived = useMemo(() => deriveReviewTotals(state.rows), [state.rows])

  const missingFieldsFor = useCallback(
    (id: string): string[] => {
      const row = state.rows.find((r) => r.id === id)
      if (!row) return []
      return missingFieldsForRow(row)
    },
    [state.rows],
  )

  return {
    state,
    setRowKind,
    patchRow,
    skipRow,
    unskipRow,
    removeRow,
    replaceState,
    missingFieldsFor,
    ...derived,
  }
}
