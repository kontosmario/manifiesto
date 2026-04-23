import { supabase } from '@/lib/supabase'
import {
  mapFixedExpensePaymentRow,
  type FixedExpensePayment,
  type FixedExpensePaymentRow,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

export async function fetchPaymentsForMonth(
  fixedExpenseIds: string[],
  periodMonth: string,
): Promise<FixedExpensePayment[]> {
  if (fixedExpenseIds.length === 0) return []
  const { data, error } = await supabase
    .from('fixed_expense_payments')
    .select('*')
    .in('fixed_expense_id', fixedExpenseIds)
    .eq('period_month', periodMonth)
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
