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
import { useEffect, useState } from 'react'
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
import { buildForecast7Day, type Forecast7Day } from '@/features/insights/forecast-engine'
import { detectCausalLinks, type CausalLink } from '@/features/insights/causal-engine'
import { useInteractionStats } from '@/features/insights/use-interaction-stats'
import { useSignalBlocklist } from '@/features/insights/use-signal-blocklist'
import { inferPersona, type UserPersona } from '@/features/insights/persona'
import { singleEntryMemoize } from '@/lib/single-entry-memo'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { resolveControlSignals } from '@/features/insights/control-v2-empty-fallback'
import { useAssistantDemoMode } from '@/features/insights/assistant-demo-store'
import { getAssistantDemoSignals } from '@/features/insights/assistant-demo-signals'
import {
  applyAssistantDemoFilter,
  useAssistantDemoFilter,
} from '@/features/insights/assistant-demo-filter-store'
import { classifyControlMode } from '@/features/insights/control-v2-mode'

// ─── Module-level memoization across hook invocations ──────────────
//
// The Home tree calls `useControlV2Data` 3 times per render (screen,
// dashboard, tab-bar advisor badge). Each invocation has its own
// `useMemo` cache, so without help the heavy computes run 3×. These
// LRU(1) caches are keyed on referential identity of the React Query
// data, so multiple call sites within one render collapse to a single
// computation. As soon as the underlying cache flips, all caches
// recompute together.

const memoizedBuildData = singleEntryMemoize(buildControlDataFromSnapshot)
const memoizedComputeView = singleEntryMemoize(computeControlView)
const memoizedComputeBaselines = singleEntryMemoize(computeUserBaselines)
const memoizedInferPersona = singleEntryMemoize(inferPersona)
const memoizedDetectCausal = singleEntryMemoize(detectCausalLinks)
const memoizedBuildForecast = singleEntryMemoize(buildForecast7Day)
const memoizedBuildSignals = singleEntryMemoize(buildControlSignals)

// ─── Read-only coercion ──────────────────────────────────────────────
//
// For now every Asistente Financiero signal is informational only:
// the user wants to be aware of risks (price hikes, zombies, velocity
// burns, imbalances) without acting from the card. We rewrite each
// task's `action` to a dismiss and normalize the CTA copy so the
// surface stays clean.
//
// Removing this pass restores per-signal CTAs (sheet hand-offs,
// routing, mutations) — keep it as a single chokepoint instead of
// scattering conditionals across UI files.
function coerceSignalsToReadOnly(
  tasks: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  return tasks.map((task) => ({
    ...task,
    cta: 'Entendido',
    action: { kind: 'dismiss', dismissId: task.id },
  }))
}

export interface ControlV2ViewModel {
  data: ControlMockData
  view: ControlView
  signals: ControlAdvisorTask[]
  /** Optional 7-day forecast — `null` while data is hydrating or
   *  when the user is still using the mock dataset. */
  forecast: Forecast7Day | null
  isLoading: boolean
  /** True when the user is brand-new or hasn't logged any expense yet —
   *  drives `signals = []` and the asistente "first-time" copy. */
  usingMock: boolean
  /** True only when `monthly_income` is missing (initial onboarding
   *  not finished). Drives the CONTROL screen's global empty state.
   *  When false but `usingMock` is true, the user has finished
   *  onboarding and CONTROL renders the real cards (with per-card
   *  placeholders for the ones that need historical data). */
  noConfig: boolean
}

export interface UseControlV2DataOptions {
  /**
   * When true, defers the heavy queries (`useControlIntelligence` and
   * `useFamilyNotifications`) by ~600ms after mount. Used by the
   * Gastos screen so the chip's data load doesn't compete with the
   * first paint of the screen (audit §3.4 / item 18).
   *
   * The lightweight queries (expenses, finance, categories, etc.) are
   * not deferred because they're already loaded by sibling screens
   * via React Query's cache, so the cost is amortized.
   */
  defer?: boolean
}

/**
 * One-stop hook: loads every slice, maps to the Control shape,
 * computes derived view + signals, exposes loading state.
 *
 * `userId` is optional — when provided, the hook also loads the
 * Memory Layer interaction stats and infers the user's persona so
 * builders with copy variants can adapt their framing. Without it,
 * the persona defaults to `'planner'` (neutral framing).
 */
export function useControlV2Data(
  familyId: string,
  userId?: string | null,
  options?: UseControlV2DataOptions,
): ControlV2ViewModel {
  // Defer flag — flips to true ~600ms after mount when
  // `options.defer` is set, otherwise true immediately. Gates the
  // heavy intelligence + notifications queries so callers (Gastos)
  // can defer them past the first paint.
  const [heavyEnabled, setHeavyEnabled] = useState(!options?.defer)
  useEffect(() => {
    if (!options?.defer) return
    const handle = setTimeout(() => setHeavyEnabled(true), 600)
    return () => clearTimeout(handle)
  }, [options?.defer])

  const expensesQuery = useExpenses(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const categoriesQuery = useCategories(familyId, 'expense')
  const goalQuery = useSavingsGoal(familyId)
  // Deferred queries: empty/undefined familyId disables the inner
  // useQuery via its `enabled: Boolean(familyId)` guard. When
  // heavyEnabled flips, the queries fire normally.
  const notificationsQuery = useFamilyNotifications(
    heavyEnabled ? familyId : undefined,
    undefined,
    40,
  )
  const intelligenceQuery = useControlIntelligence(heavyEnabled ? familyId : '')
  const interactionStatsQuery = useInteractionStats(userId ?? null)
  const blocklistQuery = useSignalBlocklist(userId ?? null)

  // Stabilise the `?? []` / `?? null` fallbacks so downstream memos
  // don't see a fresh reference on every render when the underlying
  // query data is unchanged.
  const expensesData = expensesQuery.data
  const expenses = useMemo(() => expensesData ?? [], [expensesData])
  const fixedExpensesData = fixedExpensesQuery.data
  const fixedExpenses = useMemo(() => fixedExpensesData ?? [], [fixedExpensesData])
  const finance = financeQuery.data
  const categoriesData = categoriesQuery.data
  const categoriesExpense = useMemo(() => categoriesData ?? [], [categoriesData])
  const savingsGoal = goalQuery.data ?? null
  const summariesData = intelligenceQuery.data?.summaries
  const summaries = useMemo(() => summariesData ?? [], [summariesData])
  const limitsData = intelligenceQuery.data?.limits
  const limits = useMemo(() => limitsData ?? [], [limitsData])
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

  const { usingMock, noConfig } = classifyControlMode({
    finance,
    expensesCount: expenses.length,
  })

  const { cycle: payCycle, isSalaryPendingConfirmation } = usePayCycle(familyId)
  const dismissedHikes = useDismissedHikes()
  // Each `useMemo` here delegates to a module-level LRU(1) cache via
  // `singleEntryMemoize`. With three Home-tree invocations sharing the
  // same React Query data identities, the second and third invocations
  // hit cache and the heavy compute only runs once per render cycle.
  // Gate the dev fixture on `noConfig` (income missing) instead of the
  // broader `usingMock`. Once the user finishes onboarding (income
  // configured), the adapter computes a real `data` shape from the
  // empty/sparse expense set — `cupoDiario` is meaningful, and the
  // per-card `<ControlV2Placeholder>` handles the cards that still
  // need historical data.
  const data = useMemo<ControlMockData>(() => {
    if (noConfig || !finance) return CONTROL_MOCK
    return memoizedBuildData({
      expenses,
      fixedExpenses,
      finance,
      summaries,
      payCycle,
    })
  }, [noConfig, expenses, fixedExpenses, finance, summaries, payCycle])

  const view = useMemo<ControlView>(() => memoizedComputeView(data), [data])

  const baselines = useMemo(
    () => memoizedComputeBaselines(summaries),
    [summaries],
  )

  const persona = useMemo<UserPersona>(() => {
    const stats = interactionStatsQuery.data
    if (!stats) return 'planner'
    return memoizedInferPersona(stats)
  }, [interactionStatsQuery.data])

  const causalLinks = useMemo<CausalLink[]>(() => {
    if (usingMock) return []
    if (view.detalleDias.length < 14) return []
    return memoizedDetectCausal({
      expenses,
      closedDays: view.detalleDias.length,
    })
  }, [usingMock, expenses, view.detalleDias.length])

  const forecast = useMemo<Forecast7Day | null>(() => {
    if (usingMock) return null
    if (view.detalleDias.length === 0) return null
    return memoizedBuildForecast({
      view,
      fixedExpenses,
      diasRestantes: view.diasRestantes,
      remaining: view.restanteMes,
    })
  }, [usingMock, view, fixedExpenses])

  const demoMode = useAssistantDemoMode()
  const demoFilter = useAssistantDemoFilter()
  const signals = useMemo<ControlAdvisorTask[]>(() => {
    // TESTING flag (Settings → Desarrollo → "Modo demo del asistente").
    // When ON, replace computed signals with a curated fixture
    // covering every scenario + CTA action kind. The flag is gated
    // on `__DEV__` at the toggle site, so production builds never
    // see this branch fire. The companion `demoFilter` narrows the
    // fixture to a single behavior class (read-only / routing /
    // mutation / sin acción) so each bucket can be tested in
    // isolation.
    if (demoMode) {
      return coerceSignalsToReadOnly(
        applyAssistantDemoFilter(getAssistantDemoSignals(), demoFilter),
      )
    }
    if (usingMock) return resolveControlSignals({ usingMock: true, computedSignals: [] })
    return coerceSignalsToReadOnly(
      memoizedBuildSignals({
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
        forecast,
        persona,
        paydayPending: isSalaryPendingConfirmation,
        blockedFamilies: blocklistQuery.data,
        causalLinks,
      }),
    )
  }, [
    demoMode,
    demoFilter,
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
    data.ingresoMes,
    data.fijosMes,
    dismissedHikes,
    baselines,
    forecast,
    persona,
    isSalaryPendingConfirmation,
    blocklistQuery.data,
    causalLinks,
  ])

  const isLoading =
    expensesQuery.isLoading ||
    fixedExpensesQuery.isLoading ||
    financeQuery.isLoading ||
    categoriesQuery.isLoading ||
    intelligenceQuery.isLoading

  return { data, view, signals, forecast, isLoading, usingMock, noConfig }
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
