export interface FixedExpensePaymentRow {
  id: string
  fixed_expense_id: string
  period_month: string // YYYY-MM-DD
  paid_at: string
  paid_by: string
  created_at: string
  /** Link al expense row generado por la RPC `record_fixed_expense_payment`.
   *  Persiste el 1-a-1 explicito payment ↔ expense que antes era inferible
   *  por timestamp proximity. Lo usa la RPC `revert_fixed_expense_payment`
   *  para hacer rollback atómico. Nullable: NULL para rows pre-migración
   *  20260530180000 que el backfill no pudo linkear. */
  expense_id?: string | null
}

export interface FixedExpensePayment {
  id: string
  fixedExpenseId: string
  periodMonth: string
  paidAt: string
  paidBy: string
  createdAt: string
  /** Link al expense row generado. NULL para rows legacy sin backfill. */
  expenseId: string | null
}

/**
 * The record-payment mutation seeds the cache with a synthetic optimistic
 * payment row keyed `optimistic-<iso>-<fixedExpenseId>` (see use-fixed-expenses.ts)
 * until the real server row lands. That id is NOT a uuid, so it must never be
 * passed to `revert_fixed_expense_payment(p_payment_id uuid)` (→ 22P02) nor
 * surfaced as a revertable payment id. Single source of truth for the check.
 */
export function isOptimisticPaymentId(id: string): boolean {
  return id.startsWith('optimistic-')
}

export function mapFixedExpensePaymentRow(row: FixedExpensePaymentRow): FixedExpensePayment {
  return {
    id: row.id,
    fixedExpenseId: row.fixed_expense_id,
    periodMonth: row.period_month,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    createdAt: row.created_at,
    expenseId: typeof row.expense_id === 'string' ? row.expense_id : null,
  }
}
