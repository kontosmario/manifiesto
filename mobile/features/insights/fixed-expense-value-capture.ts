// Downstream value capture for fixed-expense mutations.
//
// Today this module only covers `renegotiated_hike` (a real amount
// drop attributable to a recent `kind='price_hike'` advisor alert).
// The legacy `captureZombieDeletion` was removed when the zombie
// detection moved to the family-transparent audit flow — value capture
// for cancellations now happens via the intent resolution path in
// `mobile/features/subscriptions-zombie/use-resolve-subscription-intent.ts`.

import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { logAdvisorValue } from '@/features/insights/log-advisor-value'

interface AdvisorAlertRow {
  id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const LOOKBACK_DAYS = 30

function readFixedFromCache(
  queryClient: QueryClient,
  familyId: string,
  fixedExpenseId: string,
): FixedExpense | null {
  const cached = queryClient.getQueryData<FixedExpense[]>(
    fixedExpenseQueryKeys.family(familyId),
  )
  if (!cached) return null
  return cached.find((f) => f.id === fixedExpenseId) ?? null
}

async function findRecentAdvisorAlert(
  familyId: string,
  fixedExpenseId: string,
  kind: 'price_hike',
): Promise<AdvisorAlertRow | null> {
  const cutoff = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, metadata, created_at')
      .eq('family_id', familyId)
      .eq('kind', kind)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return null
    const rows = (data ?? []) as AdvisorAlertRow[]
    return (
      rows.find(
        (r) =>
          r.metadata &&
          typeof r.metadata === 'object' &&
          (r.metadata as Record<string, unknown>).fixed_expense_id === fixedExpenseId,
      ) ?? null
    )
  } catch {
    return null
  }
}

export async function captureHikeReduction(args: {
  queryClient: QueryClient
  familyId: string
  fixedExpenseId: string
  newAmount: number
}): Promise<void> {
  const fixed = readFixedFromCache(
    args.queryClient,
    args.familyId,
    args.fixedExpenseId,
  )
  if (!fixed) return
  const previousAmount = Number(fixed.amount ?? 0)
  const newAmount = Number(args.newAmount ?? 0)
  if (!Number.isFinite(previousAmount) || !Number.isFinite(newAmount)) return
  // Only count when the amount actually drops — increases or no-ops
  // aren't a renegotiation win.
  const monthlyDelta = previousAmount - newAmount
  if (monthlyDelta <= 0) return
  const alert = await findRecentAdvisorAlert(
    args.familyId,
    args.fixedExpenseId,
    'price_hike',
  )
  if (!alert) return
  void logAdvisorValue({
    familyId: args.familyId,
    signalId: `hike-${args.fixedExpenseId}`,
    actionTaken: 'renegotiated_hike',
    valueSaved: monthlyDelta,
    horizonMonths: 12,
    evidence: {
      fixedExpenseId: args.fixedExpenseId,
      fixedExpenseName: fixed.name,
      previousAmount,
      newAmount,
      monthlyDelta,
      sourceAlertId: alert.id,
      sourceAlertCreatedAt: alert.created_at,
    },
    isEstimated: false,
  })
}
