# Activity OCR — Phase C: Bulk Import Review Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bulk import review sheet that opens after picking an activity screenshot via the FAB and lets the user review/edit each detected `Transaction` before inserting as expenses or income events.

**Architecture:** Two new feature folders (`mobile/features/import-review/` for state + logic, `mobile/components/import-review/` for UI), one extra petal on the existing FAB (`mobile/components/navigation/add-expense-tab-button.tsx` + `add-quick-actions-overlay.tsx`), zero DB schema changes, zero new RPCs. The sheet calls the existing `createExpense` and `useCreateIncomeEvent` per row via `Promise.allSettled`. Pure mapper extracted for unit testing.

**Tech Stack:** TypeScript strict, vitest (env `node`), `@tanstack/react-query`, `expo-image-picker`, `ModalCard` (existing UI primitive), `useFamilyFinance`, `useCategories`, `useAuthSession`, `useHomeSnapshot`.

**Spec:** [`docs/superpowers/specs/2026-06-02-activity-ocr-phase-c-import-review-sheet-design.md`](../specs/2026-06-02-activity-ocr-phase-c-import-review-sheet-design.md)

**Branch:** `feature/activity-ocr` — stay on this branch. Do not push to main.

**Critical project memories that apply here:**
- `[[feedback-validate-is-not-bundle]]` — bundle pre-flight in iOS and Android at the gate task.
- `[[feedback-vitest-no-react-renderer]]` — UI components can't be unit tested (vitest env is `node`); pure modules + reducers can be.
- `[[feedback-form-modal-pattern]]` — Screen scrollable nativo + RiseView staggered + CTA inline; ModalCard is the right container.
- `[[feedback-keep-docs-in-sync]]` — once Phase C ships, write the `2026-06-XX-activity-ocr-phase-c-shipped.md` in `docs/ESTADO-DEL-PROYECTO/`.
- `[[feedback-cache-invalidation-multi-query]]` — `createExpense` invalidates expense caches via the existing repo; `useCreateIncomeEvent` invalidates income caches via its hook. Phase C calls both, so caches stay in sync automatically. NO extra invalidation needed.

---

## File map

**Create:**
- `mobile/features/import-review/types.ts` — `ReviewRowKind`, `ReviewRowWarning`, `ReviewRow`, `ReviewState`, `ConfirmResult`.
- `mobile/features/import-review/map-to-review-rows.ts` — Pure `mapToReviewRows(transactions, ctx): ReviewRow[]`.
- `mobile/features/import-review/review-reducer.ts` — Pure reducer `reviewReducer(state, action): ReviewState`.
- `mobile/features/import-review/use-import-review-controller.ts` — Hook that wraps the reducer + exposes action helpers.
- `mobile/features/import-review/use-confirm-import.ts` — Hook that iterates rows and calls `createExpense` / `mutateAsync` per-row.
- `mobile/features/import-review/open-import-flow.ts` — Pure helper that takes a `uri` + ctx and returns `Promise<ReviewState | null>` (orchestrates `parseActivity` + `mapToReviewRows`). Null when user cancels at image picker.
- `mobile/components/import-review/import-review-row.tsx` — Editable card per row.
- `mobile/components/import-review/import-review-footer.tsx` — CTA + cancel.
- `mobile/components/import-review/import-review-empty.tsx` — 0-rows placeholder.
- `mobile/components/import-review/import-review-sheet.tsx` — Root ModalCard + list orchestration.
- `tests/unit/import-review-map-to-rows.test.ts` — Pure mapper coverage.
- `tests/unit/import-review-reducer.test.ts` — Pure reducer coverage.

**Modify:**
- `mobile/components/navigation/add-quick-actions-overlay.tsx` — Extend `QuickAction.key` union to include `'import'`; bump `FAN_ANGLES_DEG` to 5 entries.
- `mobile/components/navigation/add-expense-tab-button.tsx` — Add 5th action `'import'` + handler that runs image picker + opens sheet.

**Unchanged:**
- All of Phase A + Phase B (`mobile/features/activity-ocr/`, `tests/unit/activity-ocr-*.test.ts`).
- `expense-repository.ts`, `use-income-events.ts`, `use-family-finance.ts`, `use-categories.ts`, `use-auth-session.ts`, `use-home-snapshot.ts`.
- `ModalCard`, `RiseView`, `CategoryHorizontalRail`, toast bus.

---

## Task 1: Types module

**Files:**
- Create: `mobile/features/import-review/types.ts`

Types only — no test (TypeScript verifies at compile time).

- [ ] **Step 1.1: Create the file**

Create `mobile/features/import-review/types.ts`:

```ts
import type { Transaction } from '@/features/activity-ocr/types'

export type ReviewRowKind = 'expense' | 'income' | 'skip'

export type ReviewRowWarning =
  | 'foreign-currency'
  | 'swap-ambiguous'
  | 'no-merchant'
  | 'no-date'
  | 'value-zero'

export type IncomeKind = 'transfer' | 'bonus' | 'gift' | 'other'

export interface ReviewRow {
  id: string
  kind: ReviewRowKind
  amount: number
  description: string
  date: string
  notes: string | null
  categoryId: string | null
  incomeKind: IncomeKind
  warnings: ReviewRowWarning[]
  source: {
    transaction: Transaction
    originalCurrency: string
    appliedRate: number | null
  }
}

export interface ReviewState {
  rows: ReviewRow[]
  unmatched: number
  imageUri: string
}

export interface ConfirmFailure {
  rowId: string
  description: string
  reason: string
}

export interface ConfirmResult {
  insertedExpenses: number
  insertedIncomes: number
  skipped: number
  failed: ConfirmFailure[]
}
```

- [ ] **Step 1.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 1.3: Commit**

```bash
git add mobile/features/import-review/types.ts
git commit -m "$(cat <<'EOF'
feat(import-review): domain types for Phase C bulk import sheet

ReviewRowKind ('expense'|'income'|'skip'), ReviewRow (editable draft
of one parsed Transaction), ReviewState (the sheet's source of truth),
ConfirmResult (post-confirm summary).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure mapper `mapToReviewRows`

**Files:**
- Create: `mobile/features/import-review/map-to-review-rows.ts`
- Test: `tests/unit/import-review-map-to-rows.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `tests/unit/import-review-map-to-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapToReviewRows } from '../../mobile/features/import-review/map-to-review-rows'
import type { Transaction } from '../../mobile/features/activity-ocr/types'

const TODAY = '2026-06-02'
const DEFAULT_CATEGORY = 'cat-default'
const RATE = 1000

let _id = 0
const genId = () => `row-${++_id}`
const resetIds = () => {
  _id = 0
}

const ctx = () => ({
  today: TODAY,
  defaultCategoryId: DEFAULT_CATEGORY,
  usdToArsRate: RATE,
  generateRowId: genId,
})

const mkTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  merchant: 'LA EUROPEA',
  date: '2026-06-01',
  section: null,
  primaryAmount: { value: 26000, currency: 'ARS', sign: -1 },
  secondaryAmount: null,
  raw: 'LA EUROPEA 01 jun 2026 - 26.000 ARS',
  ...overrides,
})

describe('mapToReviewRows', () => {
  it('maps a basic ARS expense with sign=-1 to kind=expense', () => {
    resetIds()
    const result = mapToReviewRows([mkTx()], ctx())
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      kind: 'expense',
      amount: 26000,
      description: 'LA EUROPEA',
      date: '2026-06-01',
      categoryId: DEFAULT_CATEGORY,
      warnings: [],
    })
    expect(result[0].source.originalCurrency).toBe('ARS')
    expect(result[0].source.appliedRate).toBeNull()
  })

  it('maps an ARS income with sign=+1 to kind=income', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'Cashback',
          primaryAmount: { value: 1500, currency: 'ARS', sign: 1 },
        }),
      ],
      ctx(),
    )
    expect(result[0]).toMatchObject({
      kind: 'income',
      amount: 1500,
      description: 'Cashback',
      incomeKind: 'other',
      categoryId: null,
      warnings: [],
    })
  })

  it('converts USDc amount via the family rate and tags source.appliedRate', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'Crypto buy',
          primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
        }),
      ],
      ctx(),
    )
    expect(result[0].amount).toBe(16000) // 16 × 1000
    expect(result[0].source.originalCurrency).toBe('USDc')
    expect(result[0].source.appliedRate).toBe(1000)
    expect(result[0].warnings).toEqual([])
  })

  it('converts USD and USDT the same way as USDc', () => {
    const result = mapToReviewRows(
      [
        mkTx({ primaryAmount: { value: 10, currency: 'USD', sign: -1 } }),
        mkTx({ primaryAmount: { value: 5, currency: 'USDT', sign: -1 } }),
      ],
      ctx(),
    )
    expect(result[0].amount).toBe(10000)
    expect(result[1].amount).toBe(5000)
  })

  it('tags a foreign currency (EUR/BRL/BTC) with warning and defaults to skip', () => {
    const result = mapToReviewRows(
      [
        mkTx({ primaryAmount: { value: 50, currency: 'EUR', sign: -1 } }),
      ],
      ctx(),
    )
    expect(result[0].kind).toBe('skip')
    expect(result[0].warnings).toContain('foreign-currency')
    expect(result[0].source.appliedRate).toBeNull()
  })

  it('tags a swap (secondaryAmount with different currency) with warning and defaults to skip', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'USDc → ARS',
          primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
          secondaryAmount: { value: 23000, currency: 'ARS', sign: 1 },
        }),
      ],
      ctx(),
    )
    expect(result[0].kind).toBe('skip')
    expect(result[0].warnings).toContain('swap-ambiguous')
  })

  it('handles missing merchant with warning and placeholder description', () => {
    const result = mapToReviewRows([mkTx({ merchant: '' })], ctx())
    expect(result[0].warnings).toContain('no-merchant')
    expect(result[0].description).toBe('(sin descripción)')
  })

  it('handles missing date by falling back to ctx.today + warning', () => {
    const result = mapToReviewRows([mkTx({ date: null })], ctx())
    expect(result[0].warnings).toContain('no-date')
    expect(result[0].date).toBe(TODAY)
  })

  it('handles zero value with warning', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 0, currency: 'ARS', sign: -1 } })],
      ctx(),
    )
    expect(result[0].warnings).toContain('value-zero')
    expect(result[0].amount).toBe(0)
  })

  it('generates unique IDs across rows', () => {
    resetIds()
    const result = mapToReviewRows([mkTx(), mkTx(), mkTx()], ctx())
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('preserves the source Transaction in source.transaction', () => {
    const tx = mkTx({ merchant: 'PEEK' })
    const result = mapToReviewRows([tx], ctx())
    expect(result[0].source.transaction).toBe(tx)
  })

  it('defaults categoryId to null for income rows', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 100, currency: 'ARS', sign: 1 } })],
      ctx(),
    )
    expect(result[0].categoryId).toBeNull()
  })

  it('rounds USD conversion to 2 decimals', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 16.789, currency: 'USDc', sign: -1 } })],
      { ...ctx(), usdToArsRate: 1234.5 },
    )
    // 16.789 × 1234.5 = 20725.7805 → round to 20725.78
    expect(result[0].amount).toBe(20725.78)
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import-review-map-to-rows.test.ts`
Expected: FAIL — `Cannot find module .../map-to-review-rows`.

- [ ] **Step 2.3: Implement the mapper**

Create `mobile/features/import-review/map-to-review-rows.ts`:

```ts
import type { Transaction } from '@/features/activity-ocr/types'
import type { IncomeKind, ReviewRow, ReviewRowKind, ReviewRowWarning } from './types'

export interface MapContext {
  today: string
  defaultCategoryId: string | null
  usdToArsRate: number
  generateRowId: () => string
}

const USD_LIKE: ReadonlySet<string> = new Set(['USD', 'USDc', 'USDT'])
const DEFAULT_INCOME_KIND: IncomeKind = 'other'

export function mapToReviewRows(
  transactions: readonly Transaction[],
  ctx: MapContext,
): ReviewRow[] {
  return transactions.map((tx) => mapOne(tx, ctx))
}

function mapOne(tx: Transaction, ctx: MapContext): ReviewRow {
  const currency = tx.primaryAmount.currency
  const isARS = currency === 'ARS'
  const isUsdLike = USD_LIKE.has(currency)
  const isForeign = !isARS && !isUsdLike

  const warnings: ReviewRowWarning[] = []

  let amount = tx.primaryAmount.value
  let appliedRate: number | null = null
  if (isUsdLike) {
    amount = Math.round(tx.primaryAmount.value * ctx.usdToArsRate * 100) / 100
    appliedRate = ctx.usdToArsRate
  } else if (isForeign) {
    warnings.push('foreign-currency')
  }

  if (
    tx.secondaryAmount &&
    tx.secondaryAmount.currency !== tx.primaryAmount.currency
  ) {
    warnings.push('swap-ambiguous')
  }

  const merchant = tx.merchant.trim()
  const hasMerchant = merchant !== ''
  if (!hasMerchant) warnings.push('no-merchant')
  if (tx.date === null) warnings.push('no-date')
  if (tx.primaryAmount.value === 0) warnings.push('value-zero')

  const ambiguous =
    warnings.includes('foreign-currency') || warnings.includes('swap-ambiguous')

  const kind: ReviewRowKind = ambiguous
    ? 'skip'
    : tx.primaryAmount.sign === 1
      ? 'income'
      : 'expense'

  return {
    id: ctx.generateRowId(),
    kind,
    amount,
    description: hasMerchant ? merchant : '(sin descripción)',
    date: tx.date ?? ctx.today,
    notes: null,
    categoryId: kind === 'expense' ? ctx.defaultCategoryId : null,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: {
      transaction: tx,
      originalCurrency: currency,
      appliedRate,
    },
  }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import-review-map-to-rows.test.ts`
Expected: PASS, 13 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add mobile/features/import-review/map-to-review-rows.ts tests/unit/import-review-map-to-rows.test.ts
git commit -m "$(cat <<'EOF'
feat(import-review): pure mapper Transaction[] → ReviewRow[]

Reglas de mapeo confirmadas con owner:
  - sign=+1 ARS  → kind='income' (incomeKind='other' por default)
  - sign=-1 ARS  → kind='expense' (categoryId default)
  - USD/USDc/USDT → convertir vía rate; appliedRate guardado
  - EUR/BRL/BTC/etc → warning + kind='skip' default
  - swap (secondary diff currency) → warning + kind='skip'
  - missing merchant / date / value-zero → warning correspondiente

13 unit tests cubren todos los caminos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure reducer for ReviewState

**Files:**
- Create: `mobile/features/import-review/review-reducer.ts`
- Test: `tests/unit/import-review-reducer.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/unit/import-review-reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ReviewRow, ReviewState } from '../../mobile/features/import-review/types'
import { reviewReducer } from '../../mobile/features/import-review/review-reducer'

const mkRow = (id: string, overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  id,
  kind: 'expense',
  amount: 100,
  description: 'Test',
  date: '2026-06-01',
  notes: null,
  categoryId: 'cat-1',
  incomeKind: 'other',
  warnings: [],
  source: {
    transaction: {
      merchant: 'Test',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 100, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
      raw: 'Test',
    },
    originalCurrency: 'ARS',
    appliedRate: null,
  },
  ...overrides,
})

const baseState: ReviewState = {
  rows: [mkRow('a'), mkRow('b'), mkRow('c')],
  unmatched: 0,
  imageUri: 'file:///fake.jpg',
}

describe('reviewReducer', () => {
  it('SET_KIND changes a row\'s kind without touching others', () => {
    const next = reviewReducer(baseState, {
      type: 'SET_KIND',
      id: 'b',
      kind: 'income',
    })
    expect(next.rows[0].kind).toBe('expense')
    expect(next.rows[1].kind).toBe('income')
    expect(next.rows[2].kind).toBe('expense')
  })

  it('PATCH_ROW merges partial fields on the target row', () => {
    const next = reviewReducer(baseState, {
      type: 'PATCH_ROW',
      id: 'a',
      patch: { amount: 500, description: 'Updated' },
    })
    expect(next.rows[0].amount).toBe(500)
    expect(next.rows[0].description).toBe('Updated')
    expect(next.rows[0].id).toBe('a')
    expect(next.rows[1]).toBe(baseState.rows[1])
  })

  it('SKIP_ROW sets kind to skip', () => {
    const next = reviewReducer(baseState, { type: 'SKIP_ROW', id: 'a' })
    expect(next.rows[0].kind).toBe('skip')
  })

  it('UNSKIP_ROW restores kind from sign (expense default)', () => {
    const skipped: ReviewState = {
      ...baseState,
      rows: [mkRow('a', { kind: 'skip' })],
    }
    const next = reviewReducer(skipped, { type: 'UNSKIP_ROW', id: 'a' })
    // Should restore to 'expense' (sign=-1 in our fixture)
    expect(next.rows[0].kind).toBe('expense')
  })

  it('UNSKIP_ROW restores to income when source sign is +1', () => {
    const skipped: ReviewState = {
      ...baseState,
      rows: [
        mkRow('a', {
          kind: 'skip',
          source: {
            transaction: {
              merchant: 'Cashback',
              date: '2026-06-01',
              section: null,
              primaryAmount: { value: 100, currency: 'ARS', sign: 1 },
              secondaryAmount: null,
              raw: 'Cashback',
            },
            originalCurrency: 'ARS',
            appliedRate: null,
          },
        }),
      ],
    }
    const next = reviewReducer(skipped, { type: 'UNSKIP_ROW', id: 'a' })
    expect(next.rows[0].kind).toBe('income')
  })

  it('REMOVE_ROW deletes a row by id', () => {
    const next = reviewReducer(baseState, { type: 'REMOVE_ROW', id: 'b' })
    expect(next.rows.map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('REPLACE returns the given state', () => {
    const newState: ReviewState = {
      rows: [mkRow('x')],
      unmatched: 5,
      imageUri: 'file:///other.jpg',
    }
    const next = reviewReducer(baseState, {
      type: 'REPLACE',
      state: newState,
    })
    expect(next).toEqual(newState)
  })

  it('unknown action returns the same state reference', () => {
    // @ts-expect-error testing exhaustive default branch
    const next = reviewReducer(baseState, { type: 'UNKNOWN' })
    expect(next).toBe(baseState)
  })

  it('SET_KIND on a non-existent id returns the same state reference', () => {
    const next = reviewReducer(baseState, {
      type: 'SET_KIND',
      id: 'nonexistent',
      kind: 'income',
    })
    expect(next).toBe(baseState)
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import-review-reducer.test.ts`
Expected: FAIL — `Cannot find module .../review-reducer`.

- [ ] **Step 3.3: Implement the reducer**

Create `mobile/features/import-review/review-reducer.ts`:

```ts
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
      const restored: ReviewRowKind =
        row.source.transaction.primaryAmount.sign === 1 ? 'income' : 'expense'
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
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import-review-reducer.test.ts`
Expected: PASS, 9 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add mobile/features/import-review/review-reducer.ts tests/unit/import-review-reducer.test.ts
git commit -m "$(cat <<'EOF'
feat(import-review): pure reducer for sheet state mutations

Acciones: SET_KIND, PATCH_ROW, SKIP_ROW, UNSKIP_ROW, REMOVE_ROW,
REPLACE. UNSKIP_ROW restaura el kind original según sign del Transaction
(income si sign=+1, expense si sign=-1) — el user nunca recupera
'foreign-currency' como expense forzado, lo deja al user editar.
Identity preserved en no-ops para que React no re-render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Controller hook `useImportReviewController`

**Files:**
- Create: `mobile/features/import-review/use-import-review-controller.ts`

No unit test — wraps `useReducer` which is React-bound.

- [ ] **Step 4.1: Create the file**

Create `mobile/features/import-review/use-import-review-controller.ts`:

```ts
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
```

- [ ] **Step 4.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4.3: Lint**

Run: `npm run lint -- mobile/features/import-review/use-import-review-controller.ts`
Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add mobile/features/import-review/use-import-review-controller.ts
git commit -m "$(cat <<'EOF'
feat(import-review): controller hook over the pure reducer

Wraps useReducer + expone helpers (setRowKind, patchRow, skipRow, etc).
Memoiza derivados que la UI usa para habilitar/deshabilitar el botón
de confirmar: submittableCount, breakdown (expenses vs incomes),
canConfirm (true cuando hay al menos una row válida y cero inválidas),
invalidIds (rows con description vacía o amount<=0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Confirm hook `useConfirmImport`

**Files:**
- Create: `mobile/features/import-review/use-confirm-import.ts`

No unit test — uses live mutations + auth.

- [ ] **Step 5.1: Create the file**

Create `mobile/features/import-review/use-confirm-import.ts`:

```ts
import { useCallback } from 'react'
import { createExpense } from '@/features/expenses/expense-repository'
import { useCreateIncomeEvent } from '@/features/income/use-income-events'
import type { ConfirmFailure, ConfirmResult, ReviewRow } from './types'

export interface ConfirmContext {
  familyId: string
  userId: string
}

export function useConfirmImport(ctx: ConfirmContext) {
  const createIncomeMut = useCreateIncomeEvent(ctx.userId)

  return useCallback(
    async (rows: readonly ReviewRow[]): Promise<ConfirmResult> => {
      const submittable = rows.filter((r) => r.kind !== 'skip')
      const skipped = rows.length - submittable.length

      const settled = await Promise.allSettled(
        submittable.map((r) => insertOne(r, ctx, createIncomeMut.mutateAsync)),
      )

      let insertedExpenses = 0
      let insertedIncomes = 0
      const failed: ConfirmFailure[] = []

      settled.forEach((res, i) => {
        const row = submittable[i]
        if (res.status === 'fulfilled') {
          if (row.kind === 'expense') insertedExpenses += 1
          else if (row.kind === 'income') insertedIncomes += 1
        } else {
          failed.push({
            rowId: row.id,
            description: row.description,
            reason:
              res.reason instanceof Error
                ? res.reason.message
                : String(res.reason),
          })
        }
      })

      return { insertedExpenses, insertedIncomes, skipped, failed }
    },
    [ctx, createIncomeMut.mutateAsync],
  )
}

async function insertOne(
  row: ReviewRow,
  ctx: ConfirmContext,
  createIncome: ReturnType<typeof useCreateIncomeEvent>['mutateAsync'],
): Promise<void> {
  if (row.kind === 'expense') {
    if (!row.categoryId) throw new Error('Falta categoría para el gasto.')
    await createExpense(ctx.familyId, ctx.userId, {
      categoryId: row.categoryId,
      description: row.description,
      notes: row.notes ?? undefined,
      price: row.amount,
      createdAt: row.date,
    })
    return
  }

  if (row.kind === 'income') {
    await createIncome({
      familyId: ctx.familyId,
      amount: row.amount,
      kind: row.incomeKind,
      description: row.description,
      eventDate: row.date,
    })
    return
  }

  // Shouldn't reach: filter dropped skips above
  throw new Error(`Unsupported row kind: ${row.kind}`)
}
```

- [ ] **Step 5.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5.3: Lint**

Run: `npm run lint -- mobile/features/import-review/use-confirm-import.ts`
Expected: PASS.

- [ ] **Step 5.4: Commit**

```bash
git add mobile/features/import-review/use-confirm-import.ts
git commit -m "$(cat <<'EOF'
feat(import-review): per-row confirm via Promise.allSettled

Hook que itera las rows no-skipped y llama createExpense
(standalone fn) o useCreateIncomeEvent.mutateAsync per row. Usa
Promise.allSettled para que un error individual no aborte el resto.
Devuelve ConfirmResult { insertedExpenses, insertedIncomes,
skipped, failed[] } para que la UI muestre toast con resumen.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ImportReviewRow` component

**Files:**
- Create: `mobile/components/import-review/import-review-row.tsx`

No unit test — UI under React (no renderer in vitest).

- [ ] **Step 6.1: Create the file**

Create `mobile/components/import-review/import-review-row.tsx`:

```tsx
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import type { Category } from '@/features/categories/use-categories'
import type { IncomeKind, ReviewRow, ReviewRowKind } from '@/features/import-review/types'

interface Props {
  row: ReviewRow
  categories: readonly Category[]
  invalid: boolean
  onSetKind: (kind: ReviewRowKind) => void
  onPatch: (patch: Partial<ReviewRow>) => void
  onUnskip: () => void
}

const INCOME_KINDS: IncomeKind[] = ['transfer', 'bonus', 'gift', 'other']
const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Otro',
}

export function ImportReviewRow({
  row,
  categories,
  invalid,
  onSetKind,
  onPatch,
  onUnskip,
}: Props) {
  const { theme } = useAppTheme()

  if (row.kind === 'skip') {
    return (
      <View
        style={[
          styles.cardSkipped,
          { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.skipLeft}>
          <MaterialIcons name="block" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.skipLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {row.description}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onUnskip} hitSlop={6}>
          <Text style={[styles.skipAction, { color: theme.colors.primary }]}>
            Restaurar
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: invalid ? theme.colors.danger : theme.colors.line,
        },
      ]}
    >
      <KindToggle kind={row.kind} onChange={onSetKind} />

      <LabeledInput
        label="Descripción"
        value={row.description}
        onChangeText={(t) => onPatch({ description: t })}
        invalid={invalid && row.description.trim() === ''}
      />

      <LabeledInput
        label={`Monto (ARS)`}
        value={String(row.amount)}
        onChangeText={(t) => {
          const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
          onPatch({ amount: Number.isFinite(n) ? n : 0 })
        }}
        keyboardType="decimal-pad"
        invalid={invalid && row.amount <= 0}
      />

      {row.source.appliedRate !== null ? (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ rate $${row.source.appliedRate}`}
        </Text>
      ) : null}

      <LabeledInput
        label="Fecha (YYYY-MM-DD)"
        value={row.date}
        onChangeText={(t) => onPatch({ date: t })}
        autoCapitalize="none"
      />

      {row.kind === 'expense' ? (
        <CategorySection
          categories={categories}
          selectedCategoryId={row.categoryId}
          onSelect={(id) => onPatch({ categoryId: id })}
        />
      ) : (
        <IncomeKindSection
          incomeKind={row.incomeKind}
          onSelect={(k) => onPatch({ incomeKind: k })}
        />
      )}

      <LabeledInput
        label="Notas (opcional)"
        value={row.notes ?? ''}
        onChangeText={(t) => onPatch({ notes: t === '' ? null : t })}
        multiline
      />

      {row.warnings.length > 0 ? (
        <View style={styles.warnings}>
          {row.warnings.map((w) => (
            <Text key={w} style={[styles.warning, { color: theme.colors.textMuted }]}>
              {warningLabel(w)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: ReviewRowKind
  onChange: (kind: ReviewRowKind) => void
}) {
  const { theme } = useAppTheme()
  const options: ReadonlyArray<{ key: ReviewRowKind; label: string }> = [
    { key: 'expense', label: 'Gasto' },
    { key: 'income', label: 'Ingreso' },
    { key: 'skip', label: 'Saltear' },
  ]
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => {
        const active = opt.key === kind
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: active ? theme.colors.primary : 'transparent',
                borderColor: active ? theme.colors.primary : theme.colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                { color: active ? '#0F2D06' : theme.colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  invalid = false,
  multiline = false,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  keyboardType?: 'default' | 'decimal-pad'
  invalid?: boolean
  multiline?: boolean
  autoCapitalize?: 'none' | 'sentences'
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: invalid ? theme.colors.danger : theme.colors.line,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      />
    </View>
  )
}

function CategorySection({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: readonly Category[]
  selectedCategoryId: string | null
  onSelect: (id: string) => void
}) {
  const cats = useMemo(() => categories.slice(), [categories])
  if (cats.length === 0) return null
  return (
    <View style={styles.field}>
      <CategoryHorizontalRail
        categories={cats}
        selectedCategoryId={selectedCategoryId ?? ''}
        onSelect={onSelect}
        label="Categoría"
        rows={2}
      />
    </View>
  )
}

function IncomeKindSection({
  incomeKind,
  onSelect,
}: {
  incomeKind: IncomeKind
  onSelect: (k: IncomeKind) => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>Tipo de ingreso</Text>
      <View style={styles.kindRow}>
        {INCOME_KINDS.map((k) => {
          const active = k === incomeKind
          return (
            <Pressable
              key={k}
              onPress={() => onSelect(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.kindBtn,
                {
                  backgroundColor: active ? theme.colors.primary : 'transparent',
                  borderColor: active ? theme.colors.primary : theme.colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.kindLabel,
                  { color: active ? '#0F2D06' : theme.colors.text },
                ]}
              >
                {INCOME_KIND_LABELS[k]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function warningLabel(w: ReviewRow['warnings'][number]): string {
  switch (w) {
    case 'foreign-currency':
      return '⚠ Moneda no soportada (EUR/BTC/etc). Editá el monto en ARS para importar.'
    case 'swap-ambiguous':
      return '⚠ Es un swap de monedas. Verificá antes de cargar.'
    case 'no-merchant':
      return '⚠ Sin descripción detectada. Completá antes de confirmar.'
    case 'no-date':
      return '⚠ Sin fecha detectada. Default: hoy.'
    case 'value-zero':
      return '⚠ Monto $0. Editá antes de confirmar.'
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardSkipped: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  skipAction: { fontSize: 13, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 12, fontWeight: '800' },
  field: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  input: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  hint: { fontSize: 11, fontWeight: '500' },
  warnings: { gap: 4, marginTop: 2 },
  warning: { fontSize: 11, fontWeight: '600' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: { fontSize: 12, fontWeight: '700' },
})
```

- [ ] **Step 6.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

If `theme.colors.danger` doesn't exist (unlikely; we used it in Phase B), fallback to `theme.colors.primary`.

- [ ] **Step 6.3: Lint**

Run: `npm run lint -- mobile/components/import-review/import-review-row.tsx`
Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add mobile/components/import-review/import-review-row.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): editable Row component for the bulk sheet

Card por fila con toggle gasto/ingreso/skip + form editable
(description, monto, fecha, categoría o tipo de ingreso, notas).
Reusa CategoryHorizontalRail del flujo de add-expense para el
picker de categorías. Renderiza warnings como hints abajo.

Para conversiones USD/USDc → ARS, muestra "16 USDc @ rate $1000"
abajo del input de monto.

Estado skipped renderiza una pill colapsada con "Restaurar".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ImportReviewFooter` + `ImportReviewEmpty`

**Files:**
- Create: `mobile/components/import-review/import-review-footer.tsx`
- Create: `mobile/components/import-review/import-review-empty.tsx`

- [ ] **Step 7.1: Create the footer**

Create `mobile/components/import-review/import-review-footer.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  expensesCount: number
  incomesCount: number
  canConfirm: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ImportReviewFooter({
  expensesCount,
  incomesCount,
  canConfirm,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const { theme } = useAppTheme()

  const label = busy
    ? 'Cargando…'
    : expensesCount + incomesCount === 0
      ? 'Nada para cargar'
      : `Confirmar ${expensesCount} gasto${expensesCount === 1 ? '' : 's'} + ${incomesCount} ingreso${incomesCount === 1 ? '' : 's'}`

  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canConfirm || busy }}
        disabled={!canConfirm || busy}
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: theme.colors.primary,
            opacity: !canConfirm || busy ? 0.55 : pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text style={styles.primaryText} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onCancel}
        style={styles.cancel}
      >
        <Text style={[styles.cancelText, { color: theme.colors.textMuted }]}>
          Cancelar
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  primary: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: { fontSize: 15, fontWeight: '900', color: '#0F2D06', letterSpacing: -0.2 },
  cancel: { paddingVertical: 6, alignItems: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700' },
})
```

- [ ] **Step 7.2: Create the empty placeholder**

Create `mobile/components/import-review/import-review-empty.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'

export function ImportReviewEmpty() {
  const { theme } = useAppTheme()
  return (
    <View style={styles.wrap}>
      <MaterialIcons name="receipt-long" size={36} color={theme.colors.textMuted} />
      <Text style={[styles.title, { color: theme.colors.text }]}>
        No detecté gastos en esa captura.
      </Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        Probá con otra imagen o cargá manualmente desde el botón principal.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  title: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 12, fontWeight: '500', textAlign: 'center', paddingHorizontal: 20 },
})
```

- [ ] **Step 7.3: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-footer.tsx mobile/components/import-review/import-review-empty.tsx`
Expected: PASS.

- [ ] **Step 7.4: Commit**

```bash
git add mobile/components/import-review/import-review-footer.tsx mobile/components/import-review/import-review-empty.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): Footer (CTA + cancel) and Empty placeholder

Footer muestra "Confirmar X gastos + Y ingresos" con disabled si no
hay rows submittables o si hay rows inválidas. Cancel cierra la
sheet sin confirmar. Empty placeholder se renderiza cuando la
captura no produjo transactions parseables.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Open import flow helper `openImportFlow`

**Files:**
- Create: `mobile/features/import-review/open-import-flow.ts`

Pure orchestration helper that handles permission + picker + parse + map. Keeps the FAB handler thin.

- [ ] **Step 8.1: Create the file**

Create `mobile/features/import-review/open-import-flow.ts`:

```ts
import * as ImagePicker from 'expo-image-picker'
import { parseActivity } from '@/features/activity-ocr/activity-parser'
import { mapToReviewRows, type MapContext } from './map-to-review-rows'
import type { ReviewState } from './types'

export type OpenImportResult =
  | { kind: 'opened'; state: ReviewState }
  | { kind: 'cancelled' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string }

export async function openImportFlow(
  ctx: MapContext,
): Promise<OpenImportResult> {
  let permission: ImagePicker.MediaLibraryPermissionResponse
  try {
    permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }
  if (!permission.granted) return { kind: 'permission-denied' }

  let pick: ImagePicker.ImagePickerResult
  try {
    pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    })
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }

  if (pick.canceled || pick.assets.length === 0) return { kind: 'cancelled' }

  const uri = pick.assets[0].uri

  try {
    const result = await parseActivity(uri)
    const rows = mapToReviewRows(result.transactions, ctx)
    return {
      kind: 'opened',
      state: {
        rows,
        unmatched: result.unmatched.length,
        imageUri: uri,
      },
    }
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
```

- [ ] **Step 8.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/features/import-review/open-import-flow.ts`
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add mobile/features/import-review/open-import-flow.ts
git commit -m "$(cat <<'EOF'
feat(import-review): openImportFlow orchestrates picker + parse + map

Pure helper que la FAB handler llama. Maneja permission denied,
cancelled (user cerró el picker), error de parseActivity, y el caso
happy: devuelve { kind: 'opened', state } listo para que la sheet
levante con ese ReviewState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `ImportReviewSheet` (root component)

**Files:**
- Create: `mobile/components/import-review/import-review-sheet.tsx`

- [ ] **Step 9.1: Create the file**

Create `mobile/components/import-review/import-review-sheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import type { ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  onClose: () => void
}

export function ImportReviewSheet({
  visible,
  initialState,
  familyId,
  userId,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const controller = useImportReviewController(initialState ?? undefined)
  const categoriesQuery = useCategories(familyId, 'expense')
  const categories = categoriesQuery.data ?? []
  const confirm = useConfirmImport({ familyId, userId })
  const [busy, setBusy] = useState(false)

  // When a new initialState arrives (new captura), replace the controller state.
  useEffect(() => {
    if (initialState) controller.replaceState(initialState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const totalRows = controller.state.rows.length
  const summary =
    totalRows === 0
      ? 'No detecté nada'
      : `Detecté ${totalRows} ${totalRows === 1 ? 'movimiento' : 'movimientos'}.`

  async function handleConfirm() {
    setBusy(true)
    try {
      const result = await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes
      if (total > 0) {
        const parts: string[] = []
        if (result.insertedExpenses > 0) {
          parts.push(`${result.insertedExpenses} gasto${result.insertedExpenses === 1 ? '' : 's'}`)
        }
        if (result.insertedIncomes > 0) {
          parts.push(`${result.insertedIncomes} ingreso${result.insertedIncomes === 1 ? '' : 's'}`)
        }
        const baseMsg = `Cargué ${parts.join(' y ')}.`
        if (result.failed.length > 0) {
          toast.error(
            `${baseMsg} ${result.failed.length} no se pudieron cargar.`,
            { durationMs: 6000 },
          )
        } else {
          toast.success(baseMsg)
        }
      } else if (result.failed.length > 0) {
        toast.error(
          `No se pudo cargar ningún movimiento (${result.failed.length} errores).`,
          { durationMs: 6000 },
        )
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalCard
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title="Revisar importación"
      subtitle={summary}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {totalRows === 0 ? (
          <ImportReviewEmpty />
        ) : (
          <View style={styles.rows}>
            {controller.state.rows.map((row) => (
              <ImportReviewRow
                key={row.id}
                row={row}
                categories={categories}
                invalid={controller.invalidIds.includes(row.id)}
                onSetKind={(kind) => controller.setRowKind(row.id, kind)}
                onPatch={(patch) => controller.patchRow(row.id, patch)}
                onUnskip={() => controller.unskipRow(row.id)}
              />
            ))}
            {controller.state.unmatched > 0 ? (
              <Text style={[styles.unmatched, { color: theme.colors.textMuted }]}>
                {`${controller.state.unmatched} líneas no se pudieron clasificar.`}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.footerSlot}>
          <ImportReviewFooter
            expensesCount={controller.submittableBreakdown.expenses}
            incomesCount={controller.submittableBreakdown.incomes}
            canConfirm={controller.canConfirm}
            busy={busy}
            onConfirm={handleConfirm}
            onCancel={onClose}
          />
        </View>
      </ScrollView>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  scrollContent: { gap: 12, paddingBottom: 24 },
  rows: { gap: 12 },
  unmatched: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  footerSlot: { marginTop: 16 },
})
```

- [ ] **Step 9.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-sheet.tsx`
Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add mobile/components/import-review/import-review-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): ImportReviewSheet — root ModalCard + orchestration

Levanta el ModalCard con un summary "Detecté N movimientos.",
renderiza N <ImportReviewRow> en scroll vertical, y el footer con
el CTA "Confirmar X gastos + Y ingresos". Al confirmar dispara
useConfirmImport, muestra toast con resultado, y cierra.

Cuando initialState cambia (nueva captura), replaceState rehace
todo el state local sin desmontar la sheet. Categories vienen via
useCategories filtrado a scope 'expense'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: FAB integration

**Files:**
- Modify: `mobile/components/navigation/add-quick-actions-overlay.tsx`
- Modify: `mobile/components/navigation/add-expense-tab-button.tsx`

- [ ] **Step 10.1: Extend `QuickAction.key` union and fan angles**

In `mobile/components/navigation/add-quick-actions-overlay.tsx`:

Locate the `QuickAction` interface (around line 32):

```tsx
export interface QuickAction {
  key: 'expense' | 'fixed' | 'income' | 'no-spend'
  label: string
  // ...
}
```

Replace with:

```tsx
export interface QuickAction {
  key: 'expense' | 'fixed' | 'income' | 'no-spend' | 'import'
  label: string
  // ... (keep the rest of the props unchanged)
}
```

Locate the constants (around lines 74-75):

```tsx
const FAN_ANGLES_DEG = [150, 110, 70, 30]
const FAN_RADIUS = 170
```

Replace with:

```tsx
// 5 petals after Phase C: re-spaced to keep equal arc spacing across
// the wider fan. The petal whose action is in the first slot of the
// caller's array gets the leftmost angle (150°), etc.
const FAN_ANGLES_DEG = [160, 130, 100, 70, 40]
const FAN_RADIUS = 170
```

- [ ] **Step 10.2: Add the 5th petal + the import handler**

In `mobile/components/navigation/add-expense-tab-button.tsx`:

Add imports at the top (alongside existing imports):

```tsx
import { useState } from 'react'
import { openImportFlow } from '@/features/import-review/open-import-flow'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import type { ReviewState } from '@/features/import-review/types'
```

(If any of these are already imported elsewhere in the file, skip the duplicate.)

Locate the `ACCENT_*` constants and add:

```tsx
const ACCENT_IMPORT = '#B894FA' // suave púrpura — distinto de los otros 4
```

Inside the component function body, add state + handler before the `quickActions` array (around line 200):

```tsx
const [importState, setImportState] = useState<ReviewState | null>(null)
const financeQuery = useFamilyFinance(familyId)
const categoriesQuery = useCategories(familyId, 'expense')

const handleOpenImport = async () => {
  if (!familyId || !userId) {
    toast.error('Necesitás estar en sesión para importar.')
    return
  }
  const rate = financeQuery.data?.usd_exchange_rate ?? 1000
  const defaultCategoryId =
    categoriesQuery.data && categoriesQuery.data.length > 0
      ? categoriesQuery.data[0].id
      : null
  const today = new Date().toISOString().slice(0, 10)
  let idCounter = 0
  const result = await openImportFlow({
    today,
    defaultCategoryId,
    usdToArsRate: rate,
    generateRowId: () => `r-${++idCounter}`,
  })

  switch (result.kind) {
    case 'opened':
      setImportState(result.state)
      break
    case 'cancelled':
      // silent
      break
    case 'permission-denied':
      toast.error('Necesito acceso a tus fotos para importar capturas.')
      break
    case 'error':
      toast.error(`No pude leer esa captura: ${result.message}`)
      break
  }
}
```

Add the 5th action inside the `quickActions` array. Append:

```tsx
{
  key: 'import',
  label: 'Importar captura',
  icon: 'document-scanner',
  accentColor: ACCENT_IMPORT,
  onPress: handleOpenImport,
},
```

Below the existing JSX render block of the FAB (right before the closing return), mount the sheet:

```tsx
<ImportReviewSheet
  visible={importState !== null}
  initialState={importState}
  familyId={familyId ?? ''}
  userId={userId ?? ''}
  onClose={() => setImportState(null)}
/>
```

(The exact insertion point depends on the existing component structure. The sheet uses `ModalCard` which renders into RN's `<Modal>`, so it auto-elevates above the rest of the screen regardless of where it sits in the tree.)

- [ ] **Step 10.3: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/navigation/add-expense-tab-button.tsx mobile/components/navigation/add-quick-actions-overlay.tsx`
Expected: PASS.

- [ ] **Step 10.4: Commit**

```bash
git add mobile/components/navigation/add-expense-tab-button.tsx mobile/components/navigation/add-quick-actions-overlay.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): FAB 5º petal "Importar captura" + sheet mount

Suma 'import' al QuickAction.key union; FAN_ANGLES_DEG pasa a 5
entradas [160, 130, 100, 70, 40] para mantener espaciado visual.

Petal usa accent púrpura ACCENT_IMPORT (#B894FA) — distinto de los
4 ya existentes. Handler corre openImportFlow → setImportState →
ImportReviewSheet abre via ModalCard.

Familia + usd_rate + categorías se prefetchean en el botón usando
los hooks existentes (useFamilyFinance, useCategories). Si el user
no tiene sesión, toast de error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final validate + bundle pre-flight + push

**Files:** none modified.

- [ ] **Step 11.1: Full validate**

Run: `npm run validate`
Expected: typecheck + lint + tests (Phase A+B 78 + new Task 2 mapper 13 + new Task 3 reducer 9 = **100 tests** passing) + guards all green.

- [ ] **Step 11.2: Bundle pre-flight iOS**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-phase-c-ios`
Expected: completes without Metro errors.

- [ ] **Step 11.3: Bundle pre-flight Android**

Run: `npx expo export --platform android --output-dir /tmp/expo-export-phase-c-android`
Expected: completes without Metro errors.

- [ ] **Step 11.4: Confirm zero new deps**

Run: `git diff origin/feature/activity-ocr~10 origin/feature/activity-ocr -- package.json package-lock.json | head -20`
Expected: empty (or only the `hasInstallScript` line from Phase B if not yet pushed).

- [ ] **Step 11.5: Push**

Run: `git push origin feature/activity-ocr`
Expected: push succeeds.

- [ ] **Step 11.6: Build IPA for device smoke**

Run: `./scripts/build-ipa.sh`
Expected: `dist/ios/Manifiesto-unsigned.ipa` produced (~28-30 MB). User sideloads via Sideloadly and smoke-tests on device.

Manual device smoke checklist (the user runs after sideload):
- [ ] FAB de Gastos muestra 5 petals (4 originales + "Importar captura")
- [ ] Tap "Importar captura" → image picker abre
- [ ] Elegir una captura conocida → sheet abre con N rows pobladas
- [ ] Cada row muestra los 3 toggle states (Gasto/Ingreso/Skip)
- [ ] Editar la descripción de 1 row funciona
- [ ] Editar el monto de 1 row funciona (con keyboard decimal)
- [ ] Skipear 1 row → renderiza como pill colapsada; tap "Restaurar" la vuelve
- [ ] Picker de categoría funciona para rows tipo expense
- [ ] Picker de tipo de ingreso funciona para rows tipo income
- [ ] Tap "Confirmar X gastos + Y ingresos" → ejecuta, sheet cierra, toast aparece
- [ ] En Home / Gastos los expenses recién creados aparecen
- [ ] En Home / actividad recente, los incomes recién creados aparecen
- [ ] Errar 1 row (ej. categoría borrada manualmente) → toast incluye "no se cargaron"

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| Types (ReviewRow, etc.) | Task 1 ✓ |
| Pure mapper Transaction[] → ReviewRow[] | Task 2 ✓ |
| State reducer + controller hook | Tasks 3 + 4 ✓ |
| Confirm hook | Task 5 ✓ |
| ImportReviewRow component | Task 6 ✓ |
| ImportReviewFooter component | Task 7 ✓ |
| ImportReviewEmpty component | Task 7 ✓ |
| Open import flow helper | Task 8 ✓ |
| ImportReviewSheet (root) | Task 9 ✓ |
| FAB integration (5º petal + handler + sheet mount) | Task 10 ✓ |
| Bundle pre-flight + device smoke | Task 11 ✓ |
| Categorización heurística (Phase E, OUT OF SCOPE) | Not in any task ✓ |
| Origin/import_metadata columns (OUT OF SCOPE) | Not in any task ✓ |
| Notification flood mitigation (declared not needed for v1) | Not in any task ✓ |

**2. Placeholder scan:** No "TBD"/"TODO"/"similar to". Every step has code or commands.

**3. Type consistency:**
- `ReviewRow.id: string`, `ReviewRow.amount: number`, `ReviewRow.kind: ReviewRowKind` consistent in all places.
- `ConfirmContext { familyId, userId }` used in Task 5 + Task 10.
- `MapContext { today, defaultCategoryId, usdToArsRate, generateRowId }` consistent in Task 2, Task 8, Task 10.
- `openImportFlow` returns `OpenImportResult` discriminated union; FAB handler in Task 10 switches on all 4 variants.
- `useConfirmImport(ctx)` returns `(rows) => Promise<ConfirmResult>`; called in Task 9.
- `categoriesQuery.data ?? []` — `useCategories` returns `Category[]` not undefined; the `?? []` is for the not-yet-loaded state.

**4. Project memory respected:**
- `[[feedback-vitest-no-react-renderer]]` — Unit tests cover ONLY the pure mapper + reducer. UI components have no vitest tests (validated by smoke in Task 11.6). ✓
- `[[feedback-validate-is-not-bundle]]` — Tasks 11.2 + 11.3 run bundle pre-flight in both platforms. ✓
- `[[feedback-form-modal-pattern]]` — ImportReviewSheet uses ModalCard, scrollable content with footer at bottom. ✓
- `[[feedback-cache-invalidation-multi-query]]` — `createExpense` and `useCreateIncomeEvent` already invalidate the right query keys themselves. Phase C doesn't bypass them. ✓
- Branch policy: all work on `feature/activity-ocr`. No push to main. ✓
- Frequent commits: 1 per task = 10 commits + final push.
- 0 new deps: confirmed in Task 11.4.
