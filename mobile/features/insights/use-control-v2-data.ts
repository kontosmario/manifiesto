// Aggregates everything the Control v2 screen needs into one hook.
//
// Reads from the `home_snapshot` caches seeded at app-shell time
// (same pattern as the rest of the app) plus three new slices added
// by the `20260424150000_control_intelligence.sql` migration:
//   - `monthly_summaries_history` (last 6 closed cycles)
//   - `category_limits` (user-defined caps)
//   - `velocity_today` (daily pre-computed rollup)
//
// Falls back to the mock when data is missing so the screen never
// looks broken in development or on a first-run account.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useCategories } from '@/features/categories/use-categories'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyNotifications } from '@/features/notifications/use-notifications'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useDismissedHikes } from '@/features/fijos/use-hike-dismiss-store'
import {
  buildControlDataFromSnapshot,
  type MonthlySummaryHistory,
} from '@/features/insights/control-v2-adapter'
import {
  CONTROL_MOCK,
  computeControlView,
  type ControlMockData,
  type ControlView,
} from '@/features/insights/control-v2-mock'
import {
  buildControlSignals,
  type CategoryLimit,
  type VelocitySnapshot,
  type NotificationLite,
} from '@/features/insights/control-signals'
import { computeUserBaselines } from '@/features/insights/user-baselines'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface ControlIntelligenceRow {
  family_id: string
  monthly_summaries_history: MonthlySummaryHistory[] | null
  category_limits: CategoryLimit[] | null
  velocity_today: VelocitySnapshot | null
}

export interface ControlV2ViewModel {
  data: ControlMockData
  view: ControlView
  signals: ControlAdvisorTask[]
  isLoading: boolean
  /** True when we fell back to the mock dataset (no real data yet). */
  usingMock: boolean
}

/**
 * One-stop hook: loads every slice, maps to the Control shape,
 * computes derived view + signals, exposes loading state.
 */
export function useControlV2Data(familyId: string): ControlV2ViewModel {
  const expensesQuery = useExpenses(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const categoriesQuery = useCategories(familyId, 'expense')
  const goalQuery = useSavingsGoal(familyId)
  const notificationsQuery = useFamilyNotifications(familyId, undefined, 40)
  const intelligenceQuery = useControlIntelligence(familyId)

  const expenses = expensesQuery.data ?? []
  const fixedExpenses = fixedExpensesQuery.data ?? []
  const finance = financeQuery.data
  const categoriesExpense = categoriesQuery.data ?? []
  const savingsGoal = goalQuery.data ?? null
  const summaries = intelligenceQuery.data?.summaries ?? []
  const limits = intelligenceQuery.data?.limits ?? []
  const velocity = intelligenceQuery.data?.velocity ?? null
  const notifications: NotificationLite[] = (notificationsQuery.data ?? []).map(
    (n) => ({
      id: n.id,
      kind: n.kind,
      severity: n.severity,
      created_at: n.created_at,
      metadata: n.metadata as Record<string, unknown>,
    }),
  )

  const usingMock =
    !finance ||
    finance.monthly_income <= 0 ||
    expenses.length === 0

  const { cycle: payCycle } = usePayCycle(familyId)
  const dismissedHikes = useDismissedHikes()
  const data = useMemo<ControlMockData>(() => {
    if (usingMock || !finance) return CONTROL_MOCK
    return buildControlDataFromSnapshot({
      expenses,
      fixedExpenses,
      finance,
      summaries,
      payCycle,
    })
  }, [usingMock, expenses, fixedExpenses, finance, summaries, payCycle])

  const view = useMemo<ControlView>(() => computeControlView(data), [data])

  const baselines = useMemo(
    () => computeUserBaselines(summaries),
    [summaries],
  )

  const signals = useMemo<ControlAdvisorTask[]>(() => {
    if (usingMock) return CONTROL_MOCK.tareas
    return buildControlSignals({
      view,
      expenses,
      fixedExpenses,
      categoriesExpense,
      summaries,
      limits,
      velocity,
      notifications,
      savingsGoal,
      cupoDiario: data.cupoDiario,
      gastoHoy: data.gastoHoy,
      diasRestantes: view.diasRestantes,
      ingresoMes: data.ingresoMes,
      fijosMes: data.fijosMes,
      dismissedHikes,
      baselines,
    })
  }, [
    usingMock,
    view,
    expenses,
    fixedExpenses,
    categoriesExpense,
    summaries,
    limits,
    velocity,
    notifications,
    savingsGoal,
    data.cupoDiario,
    data.gastoHoy,
    dismissedHikes,
    baselines,
  ])

  const isLoading =
    expensesQuery.isLoading ||
    fixedExpensesQuery.isLoading ||
    financeQuery.isLoading ||
    categoriesQuery.isLoading ||
    intelligenceQuery.isLoading

  return { data, view, signals, isLoading, usingMock }
}

// ─── Intelligence slice (summaries + limits + velocity) ─────────────

interface ControlIntelligencePayload {
  summaries: MonthlySummaryHistory[]
  limits: CategoryLimit[]
  velocity: VelocitySnapshot | null
}

export const controlIntelligenceQueryKey = (familyId?: string) =>
  ['control-intelligence', familyId ?? null] as const

function useControlIntelligence(familyId: string) {
  return useQuery<ControlIntelligencePayload>({
    queryKey: controlIntelligenceQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      // The data is also embedded in home_snapshot; this is a direct
      // fallback for when the user navigates before the snapshot has
      // been refetched. Each of the 3 tables is tiny — the joined
      // cost is negligible.
      const [summaries, limits, velocity] = await Promise.all([
        fetchSummaries(familyId),
        fetchLimits(familyId),
        fetchVelocity(familyId),
      ])
      return { summaries, limits, velocity }
    },
    staleTime: 2 * 60_000,
  })
}

async function fetchSummaries(
  familyId: string,
): Promise<MonthlySummaryHistory[]> {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select(
      'id, period_start, period_end, period_label, total_variable_spent, total_spent, expenses_count, monthly_income, savings_delta, category_breakdown, daily_totals, top_expense, delta_vs_previous_percent, mood',
    )
    .eq('family_id', familyId)
    .order('period_start', { ascending: false })
    .limit(6)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as MonthlySummaryHistory[]
}

async function fetchLimits(familyId: string): Promise<CategoryLimit[]> {
  const { data, error } = await supabase
    .from('category_limits')
    .select('id, category_id, monthly_cap, warning_threshold_pct')
    .eq('family_id', familyId)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as CategoryLimit[]
}

async function fetchVelocity(
  familyId: string,
): Promise<VelocitySnapshot | null> {
  const { data, error } = await supabase
    .from('velocity_snapshots')
    .select(
      'snapshot_date, avg_daily_last_7, avg_daily_last_30, momentum, forecast_close_amount, stress_level',
    )
    .eq('family_id', familyId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return (data as VelocitySnapshot | null) ?? null
}

/**
 * Tolerate the new tables not being there yet (the migration may not
 * have been applied in a given environment). A missing-table error
 * from PostgREST comes through with code 42P01 or "does not exist"
 * in the message — treat both as "empty data" instead of crashing.
 */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return (error.message ?? '').toLowerCase().includes('does not exist')
}
