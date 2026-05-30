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
