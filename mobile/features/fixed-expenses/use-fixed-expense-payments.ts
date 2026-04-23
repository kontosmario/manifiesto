import { useQuery } from '@tanstack/react-query'
import { fetchPaymentsForMonth } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import {
  firstOfCurrentMonth,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/fixed-expense-payment.model'

export const fixedExpensePaymentsKey = (familyId?: string, periodMonth?: string) =>
  ['fixed-expense-payments', familyId ?? null, periodMonth ?? null] as const

export function useFixedExpensePayments(params: {
  familyId?: string
  fixedExpenseIds: string[]
  today?: Date
}) {
  const periodMonth = firstOfCurrentMonth(params.today ?? new Date())
  return useQuery<FixedExpensePayment[]>({
    queryKey: fixedExpensePaymentsKey(params.familyId, periodMonth),
    enabled: Boolean(params.familyId) && params.fixedExpenseIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchPaymentsForMonth(params.fixedExpenseIds, periodMonth),
  })
}
