// Downstream value capture for fixed-expense mutations.
//
// The dispatcher path used to optimistically log `cancelled_zombie` /
// `renegotiated_hike` the moment a user tapped the CTA — but that
// over-counted (the user might just peek at the editor and back out).
// This module closes the loop honestly: only when the underlying
// `fixed_expense` is actually deleted (zombie) or its amount actually
// drops (hike), we cross-reference the recent advisor alerts and log
// real counterfactual value.
//
// Cross-reference: we look for `kind='zombie_alert'` /
// `kind='price_hike'` notifications attached to this fixed_expense_id
// within the last 30 days. If found, the deletion / reduction is
// causally attributed to the advisor and recorded in
// `advisor_value_log` (non-estimated, evidence-bearing).

import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { logAdvisorValue } from '@/features/insights/log-advisor-value'

interface ZombieAlertRow {
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
  kind: 'zombie_alert' | 'price_hike',
): Promise<ZombieAlertRow | null> {
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
    const rows = (data ?? []) as ZombieAlertRow[]
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

export async function captureZombieDeletion(args: {
  queryClient: QueryClient
  familyId: string
  fixedExpenseId: string
}): Promise<void> {
  const fixed = readFixedFromCache(
    args.queryClient,
    args.familyId,
    args.fixedExpenseId,
  )
  // Without the cached row we can't reconstruct the monthly amount,
  // so we degrade silently — better no log than a wrong one.
  if (!fixed) return
  const monthlyAmount = Number(fixed.amount ?? 0)
  if (monthlyAmount <= 0) return
  const alert = await findRecentAdvisorAlert(
    args.familyId,
    args.fixedExpenseId,
    'zombie_alert',
  )
  if (!alert) return // delete wasn't attributable to a zombie signal
  void logAdvisorValue({
    familyId: args.familyId,
    signalId: `zombie-${args.fixedExpenseId}`,
    actionTaken: 'cancelled_zombie',
    valueSaved: monthlyAmount,
    horizonMonths: 12,
    evidence: {
      fixedExpenseId: args.fixedExpenseId,
      fixedExpenseName: fixed.name,
      monthlyAmount,
      sourceAlertId: alert.id,
      sourceAlertCreatedAt: alert.created_at,
    },
    isEstimated: false,
  })
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
