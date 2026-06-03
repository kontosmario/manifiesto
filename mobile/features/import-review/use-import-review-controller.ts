import { useCallback, useMemo, useReducer } from 'react'
import type { ReviewRow, ReviewRowKind, ReviewState } from './types'
import { reviewReducer } from './review-reducer'

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
  /** true cuando hay al menos una row submittable y ninguna invalida. */
  canConfirm: boolean
  /** Invalid IDs (description vacía o amount<=0) entre las submittable. */
  invalidIds: string[]
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

  const derived = useMemo(() => {
    const submittable = state.rows.filter((r) => r.kind !== 'skip')
    const expenses = submittable.filter((r) => r.kind === 'expense').length
    const incomes = submittable.filter((r) => r.kind === 'income').length
    const skipped = state.rows.length - submittable.length
    const invalidIds = submittable
      .filter((r) => r.description.trim() === '' || r.amount <= 0)
      .map((r) => r.id)
    return {
      submittableCount: submittable.length,
      submittableBreakdown: { expenses, incomes },
      skippedCount: skipped,
      canConfirm: submittable.length > 0 && invalidIds.length === 0,
      invalidIds,
    }
  }, [state.rows])

  return {
    state,
    setRowKind,
    patchRow,
    skipRow,
    unskipRow,
    removeRow,
    replaceState,
    ...derived,
  }
}
