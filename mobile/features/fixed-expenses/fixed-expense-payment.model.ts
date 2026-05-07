export interface FixedExpensePaymentRow {
  id: string
  fixed_expense_id: string
  period_month: string // YYYY-MM-DD
  paid_at: string
  paid_by: string
  created_at: string
}

export interface FixedExpensePayment {
  id: string
  fixedExpenseId: string
  periodMonth: string
  paidAt: string
  paidBy: string
  createdAt: string
}

export function mapFixedExpensePaymentRow(row: FixedExpensePaymentRow): FixedExpensePayment {
  return {
    id: row.id,
    fixedExpenseId: row.fixed_expense_id,
    periodMonth: row.period_month,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    createdAt: row.created_at,
  }
}
