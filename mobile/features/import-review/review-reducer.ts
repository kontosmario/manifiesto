import type { ReviewRow, ReviewRowKind, ReviewState } from './types'

export type ReviewAction =
  | { type: 'SET_KIND'; id: string; kind: ReviewRowKind }
  | { type: 'PATCH_ROW'; id: string; patch: Partial<ReviewRow> }
  | { type: 'SKIP_ROW'; id: string }
  | { type: 'UNSKIP_ROW'; id: string }
  | { type: 'REMOVE_ROW'; id: string }
  | { type: 'REPLACE'; state: ReviewState }

export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
): ReviewState {
  switch (action.type) {
    case 'REPLACE':
      return action.state

    case 'SET_KIND': {
      const idx = state.rows.findIndex((r) => r.id === action.id)
      if (idx === -1) return state
      const next = state.rows.slice()
      next[idx] = { ...next[idx], kind: action.kind }
      return { ...state, rows: next }
    }

    case 'PATCH_ROW': {
      const idx = state.rows.findIndex((r) => r.id === action.id)
      if (idx === -1) return state
      const next = state.rows.slice()
      next[idx] = { ...next[idx], ...action.patch }
      return { ...state, rows: next }
    }

    case 'SKIP_ROW': {
      const idx = state.rows.findIndex((r) => r.id === action.id)
      if (idx === -1) return state
      const next = state.rows.slice()
      next[idx] = { ...next[idx], kind: 'skip' }
      return { ...state, rows: next }
    }

    case 'UNSKIP_ROW': {
      const idx = state.rows.findIndex((r) => r.id === action.id)
      if (idx === -1) return state
      const row = state.rows[idx]
      // Apple Pay nunca produce un ingreso (un tap NFC siempre es un
      // gasto o, si es negativo, una devolución que ya quedó en `skip`).
      const restored: ReviewRowKind =
        row.source.origin === 'ocr' && row.source.transaction.primaryAmount.sign === 1
          ? 'income'
          : 'expense'
      const next = state.rows.slice()
      next[idx] = { ...row, kind: restored }
      return { ...state, rows: next }
    }

    case 'REMOVE_ROW': {
      const next = state.rows.filter((r) => r.id !== action.id)
      if (next.length === state.rows.length) return state
      return { ...state, rows: next }
    }

    default:
      return state
  }
}
