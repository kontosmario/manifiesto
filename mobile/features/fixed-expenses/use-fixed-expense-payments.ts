import { useQuery } from '@tanstack/react-query'
import { fetchPaymentsInRange } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import { type FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'

export const fixedExpensePaymentsKey = (
  familyId?: string,
  startIso?: string,
  endIso?: string,
) => ['fixed-expense-payments', familyId ?? null, startIso ?? null, endIso ?? null] as const

/**
 * Payments whose `paid_at` falls within the current pay cycle
 * `[cycleStart, cycleEnd)`. Replaces the calendar-month fetch so the
 * Fijos screen marks as "paid this cycle" any commitment the user
 * actually settled inside the active cycle window.
 */
export function useFixedExpensePayments(params: {
  familyId?: string
  fixedExpenseIds: string[]
  cycleStart: Date
  cycleEnd: Date
}) {
  const startIso = params.cycleStart.toISOString()
  const endIso = params.cycleEnd.toISOString()
  return useQuery<FixedExpensePayment[]>({
    queryKey: fixedExpensePaymentsKey(params.familyId, startIso, endIso),
    enabled: Boolean(params.familyId) && params.fixedExpenseIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchPaymentsInRange(params.fixedExpenseIds, startIso, endIso),
  })
}
