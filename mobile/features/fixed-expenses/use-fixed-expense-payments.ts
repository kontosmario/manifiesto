import { useQuery } from '@tanstack/react-query'
import { fetchPaymentsInRange } from '@/features/fixed-expenses/fixed-expense-payment.repository'
import { keepPersistedFixedExpenseIds } from '@/features/fixed-expenses/fixed-expense-id'
import { type FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'

/**
 * Signature estable y determinística para una colección de ids: ordena
 * + concatena. Permite que la queryKey distinga entre callers que pasan
 * conjuntos distintos de fixedExpenseIds (Home vs Fijos) y evita cache
 * collision si dos callers en el mismo familyId/cycle window fetchean
 * subsets diferentes.
 */
export function fixedExpenseIdsSignature(ids?: readonly string[]): string {
  if (!ids || ids.length === 0) return ''
  return [...ids].sort().join(',')
}

export const fixedExpensePaymentsKey = (
  familyId?: string,
  startIso?: string,
  endIso?: string,
  idsSignature?: string,
) =>
  [
    'fixed-expense-payments',
    familyId ?? null,
    startIso ?? null,
    endIso ?? null,
    idsSignature ?? '',
  ] as const

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
  // Strip optimistic `temp-` ids: they don't exist server-side, and querying
  // them 400s the whole batch. Filtering here (before the signature) also keeps
  // the query key stable across the optimistic window — appending an
  // unpersisted row no longer churns the key or triggers a throwaway fetch.
  const persistedIds = keepPersistedFixedExpenseIds(params.fixedExpenseIds)
  const idsSignature = fixedExpenseIdsSignature(persistedIds)
  return useQuery<FixedExpensePayment[]>({
    queryKey: fixedExpensePaymentsKey(params.familyId, startIso, endIso, idsSignature),
    enabled: Boolean(params.familyId) && persistedIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchPaymentsInRange(persistedIds, startIso, endIso),
  })
}
