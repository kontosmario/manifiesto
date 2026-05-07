import { supabase } from '@/lib/supabase'
import {
  mapFixedExpensePaymentRow,
  type FixedExpensePayment,
  type FixedExpensePaymentRow,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

/**
 * Fetches payments whose `paid_at` falls within the half-open window
 * `[startIso, endIso)`. Used by the pay-cycle-aware Fijos summary
 * to read "what was paid during this cycle".
 */
export async function fetchPaymentsInRange(
  fixedExpenseIds: string[],
  startIso: string,
  endIso: string,
): Promise<FixedExpensePayment[]> {
  if (fixedExpenseIds.length === 0) return []
  const { data, error } = await supabase
    .from('fixed_expense_payments')
    .select('*')
    .in('fixed_expense_id', fixedExpenseIds)
    .gte('paid_at', startIso)
    .lt('paid_at', endIso)
  if (error) throw error
  return (data ?? []).map((r) => mapFixedExpensePaymentRow(r as FixedExpensePaymentRow))
}

export async function createPayment(input: {
  fixedExpenseId: string
  userId: string
  periodMonth: string
}): Promise<FixedExpensePayment> {
  const { data, error } = await supabase
    .from('fixed_expense_payments')
    .insert({
      fixed_expense_id: input.fixedExpenseId,
      paid_by: input.userId,
      period_month: input.periodMonth,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapFixedExpensePaymentRow(data as FixedExpensePaymentRow)
}
