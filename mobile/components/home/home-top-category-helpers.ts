// Pure helpers for the "Top category" chip (Sprint 2A).
//
// Computes the leading discretionary category for the current pay
// cycle from the cached `expenses` list. No round-trip — everything
// is derived client-side from data the family-dashboard hook already
// returns. Lives in its own module so the heavy aggregation runs
// inside a `useMemo` keyed on referential identity, and so the logic
// is unit-testable without dragging React into the test runner.

import type { Expense } from '@/features/expenses/use-expenses'

export interface TopCategoryResult {
  /** Category UUID — used for the deep-link filter. */
  categoryId: string
  /** Display name fallback to "Sin categoría" when missing. */
  name: string
  /** Sum of discretionary spend in this cycle (ARS, rounded). */
  total: number
  /** Fraction of the cycle's discretionary total — 0..1. */
  share: number
}

interface CategoryLookup {
  /** Map id → display name. The Home tree already memoizes this from
   *  `useCategories(familyId)`. */
  categoryNameById: ReadonlyMap<string, string>
}

interface ComputeArgs extends CategoryLookup {
  expenses: readonly Expense[]
  cycleStart: Date
  cycleEnd: Date
  /** Minimum transactions for the chip to surface. Default 4. The
   *  earlier closedDays gate was dropped — surfacing the leader from
   *  day 1 helps users spot consumption patterns fast; the
   *  transactions gate alone is enough to keep the ranking stable. */
  minTransactions?: number
}

/** Minimum transactions to surface the chip. Below this, the "top"
 *  is unstable noise (a single $50 coffee tops a thin cycle). */
const DEFAULT_MIN_TRANSACTIONS = 4

/**
 * Identify the category with the highest discretionary spend in the
 * current pay-cycle window. Returns null when the cycle has too few
 * transactions to pick a stable leader or no category data.
 */
export function computeTopCategory(args: ComputeArgs): TopCategoryResult | null {
  const minTransactions = args.minTransactions ?? DEFAULT_MIN_TRANSACTIONS
  const startMs = args.cycleStart.getTime()
  const endMs = args.cycleEnd.getTime()
  let total = 0
  let count = 0
  const byCategory = new Map<string, number>()
  for (const e of args.expenses) {
    if (e.commitment_id) continue // skip auto-recorded fixed payments
    const ts = new Date(e.created_at).getTime()
    if (Number.isNaN(ts)) continue
    if (ts < startMs || ts >= endMs) continue
    const price = Number(e.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) continue
    const id = e.category_id || '__uncat__'
    byCategory.set(id, (byCategory.get(id) ?? 0) + price)
    total += price
    count += 1
  }
  if (count < minTransactions) return null
  if (total <= 0) return null

  let topId: string | null = null
  let topAmount = 0
  for (const [id, amount] of byCategory) {
    if (amount > topAmount) {
      topId = id
      topAmount = amount
    }
  }
  if (!topId) return null

  // Contract: `categoryId: ''` means "no real category id available"
  // — happens when expenses were tagged with deleted categories or
  // had no category to begin with. The deep-link target must treat
  // empty `categoryId` as "no filter" (lands on the unfiltered
  // expenses screen) because the `__uncat__` bucket conflates ALL
  // deleted/missing categories. If a future caller wires the empty
  // string into a real filter, the conflation becomes user-visible
  // and this helper would need to disambiguate.
  return {
    categoryId: topId === '__uncat__' ? '' : topId,
    name:
      topId === '__uncat__'
        ? 'Sin categoría'
        : args.categoryNameById.get(topId) ?? 'Sin categoría',
    total: Math.round(topAmount),
    share: total > 0 ? topAmount / total : 0,
  }
}

/** Format the share as a tight integer percent (0..100), no decimals
 *  — the chip is glanceable, not a financial breakdown. */
export function formatTopCategoryShare(share: number): string {
  return `${Math.round(share * 100)}%`
}

/**
 * Fallback payload for the Variables band when `computeTopCategory`
 * returns null. The Home renders this so the band slot stays visually
 * symmetric with the Fijos card.
 *
 * Two kinds:
 *   - `empty`   → no expenses at all this cycle. Actionable: tap → /add.
 *   - `sparse`  → fewer than the minimum transactions. Informational
 *                 with an instructive secondary line.
 *
 * (The earlier `early` kind disappeared together with the closedDays
 * gate — the chip now surfaces from day 1 once there are enough
 * transactions, so a "wait N days" message no longer applies.)
 */
export type TopCategoryFallback =
  | {
      kind: 'empty'
      primary: string
      secondary: string
    }
  | {
      kind: 'sparse'
      primary: string
      secondary: string
    }

interface ComputeFallbackArgs {
  /** Result of `computeTopCategory`. Pass it through so this helper
   *  short-circuits to null when there's nothing to fallback for. */
  topCategory: TopCategoryResult | null
  /** Variable transaction count for the current cycle (matches
   *  `HomeMonthSummary.variableCount`). */
  variableCount: number
  /** Mirror of the helper's threshold. Defaults to 4. */
  minTransactions?: number
}

/**
 * Build the fallback payload. Returns null when there IS a top
 * category (no fallback needed). The Variables panel shows the
 * fallback band when this returns non-null.
 */
export function computeTopCategoryFallback(
  args: ComputeFallbackArgs,
): TopCategoryFallback | null {
  if (args.topCategory) return null

  const minTransactions = args.minTransactions ?? DEFAULT_MIN_TRANSACTIONS

  // Empty state — virgin cycle, nothing to lead. Push the user to add
  // their first expense; once they cross the transactions threshold the
  // chip rotates to a real top category.
  if (args.variableCount <= 0) {
    return {
      kind: 'empty',
      primary: 'Cargá tu primer gasto',
      secondary: 'Arrancá el ciclo registrando algo',
    }
  }

  // Sparse cycle — at least one transaction logged but fewer than the
  // minimum. The "leader" would be unstable noise (a single $50 coffee
  // tops a 2-transaction cycle).
  if (args.variableCount < minTransactions) {
    return {
      kind: 'sparse',
      primary: 'Sin categoría líder aún',
      secondary: 'Cargá más gastos para verla',
    }
  }

  // Defensive fall-through — gate passed but the helper still
  // returned null (e.g., total === 0 due to all-zero prices). Surface
  // a generic placeholder instead of a blank.
  return {
    kind: 'sparse',
    primary: 'Sin categoría líder aún',
    secondary: 'Aún no hay datos suficientes',
  }
}
