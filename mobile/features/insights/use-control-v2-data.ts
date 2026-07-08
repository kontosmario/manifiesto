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
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useCategories } from '@/features/categories/use-categories'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyNotifications } from '@/features/notifications/use-notifications'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'
import { useDismissedHikes } from '@/features/fijos/use-hike-dismiss-store'
import {
  buildControlDataFromSnapshot,
  type MonthlySummaryHistory,
} from '@/features/insights/control-v2-adapter'
import { buildWrappedPayloadFromSummary } from '@/features/wrapped/build-wrapped-payload'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
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
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import type { SubscriptionCheckin } from '@/features/subscriptions-zombie/usage-checkin'
import { computeUserBaselines } from '@/features/insights/user-baselines'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import {
  useCycleIncomeEventsTotal,
  useIncomeEvents,
  type IncomeEventKind,
} from '@/features/income/use-income-events'
import { buildForecast7Day, type Forecast7Day } from '@/features/insights/forecast-engine'
import { useInteractionStats } from '@/features/insights/use-interaction-stats'
import { useAdvisorPreferences } from '@/features/insights/use-advisor-preferences'
import { useSignalBlocklist } from '@/features/insights/use-signal-blocklist'
import { areSignalsReady } from '@/features/insights/signals-ready'
import { inferPersona, type UserPersona } from '@/features/insights/persona'
import { singleEntryMemoize } from '@/lib/single-entry-memo'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import {
  dismissKeyFor,
  useDismissalsHydrated,
  useDismissedIds,
} from '@/features/insights/control-dismiss-store'
import { resolveControlSignals } from '@/features/insights/control-v2-empty-fallback'
import {
  useControlSnapshot,
  type ControlSnapshot,
  type OverBudgetCategoryRow,
  type MemberPressureRow,
} from '@/features/insights/use-control-snapshot'
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
    cta: i18n.t('insights:cta.entendido'),
    action: { kind: 'dismiss', dismissId: task.id },
  }))
}

/** Ingresos extra del ciclo para la card "Entró este ciclo". */
export interface IngresosCiclo {
  /** Total de income_events del ciclo (misma query que Home). */
  total: number
  /** Movimientos del ciclo, más reciente primero. */
  movimientos: Array<{
    id: string
    /** event_date en formato YYYY-MM-DD. */
    fecha: string
    kind: IncomeEventKind
    descripcion: string | null
    monto: number
  }>
}

export interface ControlV2ViewModel {
  data: ControlMockData
  view: ControlView
  /** Ingresos extra del ciclo — la card se monta solo si total > 0. */
  ingresosCiclo: IngresosCiclo
  /** Señales VISIBLES del asistente: ya filtradas por blocklist (familias
   *  bloqueadas) Y por dismissed (descartadas), y vacías hasta que ambos
   *  filtros cargaron (`signalsReady`). Source of truth único — todos los
   *  consumidores leen de aquí, no re-filtran. */
  signals: ControlAdvisorTask[]
  /** `true` cuando los filtros async (blocklist + dismissals) ya cargaron y
   *  `signals` es confiable. Las superficies que LISTAN señales deben mostrar
   *  loading mientras es `false` (evita el flash aparecer→desaparecer). */
  signalsReady: boolean
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
  /** Modo INGRESO DINÁMICO sin ingresos cargados en el ciclo: el stack
   *  completo de cards daría $0/NaN engañosos ("Vas bien hoy · LIBRE HOY
   *  $0"), así que la pantalla muestra la guía "carga tu primer ingreso"
   *  en su lugar. `false` mientras la query de ingresos hidrata (evita
   *  flash de la guía para dinámicos que SÍ tienen ingresos). */
  dynamicNoIncome: boolean
  /**
   * Pre-computed snapshot from the `control_snapshot()` RPC (migration
   * 20260512030000). Exposed as a surface-level field for progressive
   * consumption. The deep integration in `useControlV2Data` already
   * routes specific fields (forecast / over_budget / zombies) through
   * the existing engines when the snapshot is non-empty; the snapshot
   * itself remains exposed so consumers can read additional fields
   * (e.g. `member_pressure`, `recommended_actions`) directly.
   * `null` while loading or when the RPC is unavailable (migration
   * not yet applied).
   */
  controlSnapshot: ControlSnapshot | null
  /**
   * Payload listo para disparar el "Manifiesto Wrapped" del ciclo recién
   * cerrado desde la card "VS mes". `null` cuando no hay un cierre con
   * gastos para reproducir.
   */
  wrappedPayload: CycleWrappedPayload | null
  /** Id del `monthly_summaries` del cierre a reproducir (para marcarlo
   *  visto). `null` cuando no hay cierre reproducible. */
  wrappedSummaryId: string | null
  /** True cuando el Wrapped del cierre más reciente ya fue visto — apaga
   *  el pulse de discoverability del header. */
  wrappedSeen: boolean
  /**
   * Server-computed forecast close amount + overshoot pct, surfaced
   * verbatim from `control_snapshot.forecast_close_amount` /
   * `forecast_overshoot_pct` when both are non-null. Consumers should
   * prefer this over the engine-computed `forecast` for cycle-close
   * projections, since the server has access to the canonical historical
   * baselines. `null` when the snapshot is missing or fields are null.
   */
  forecastFromServer: { closeAmount: number; overshootPct: number | null } | null
  /**
   * Server-computed over-budget categories from
   * `control_snapshot.over_budget_categories`. When non-empty, also
   * shadows the `limits` input fed to `buildControlSignals` so the
   * cap-breach signals reflect the server's authoritative caps and
   * spend totals. `null` when the snapshot is missing or empty.
   */
  overBudgetFromServer: OverBudgetCategoryRow[] | null
  /**
   * Server-computed per-member spend pressure from
   * `control_snapshot.member_pressure`. Currently unused by the engines
   * (no analog input today) — exposed for downstream consumers that
   * want to render member-level pressure. `null` when the snapshot is
   * missing or empty.
   */
  memberPressureFromServer: MemberPressureRow[] | null
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
// Referencia estable para el caso "no listo" — evita un array nuevo por
// render (que rompería la memo de los consumidores).
const EMPTY_SIGNALS: ControlAdvisorTask[] = []

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
  const advisorPrefsQuery = useAdvisorPreferences()
  const blocklistQuery = useSignalBlocklist(userId ?? null)
  const controlSnapshotQuery = useControlSnapshot(userId ?? undefined)
  // home_snapshot (cache caliente del app-shell) — fuente de
  // subscription_checkins (LIVE, sin ventana de ciclo) para el check-in de uso.
  const homeSnapshotQuery = useHomeSnapshot(userId ?? undefined)

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
  const limitsBase = useMemo(() => limitsData ?? [], [limitsData])
  const velocity = intelligenceQuery.data?.velocity ?? null
  const notificationsBase: NotificationLite[] = (notificationsQuery.data ?? []).map(
    (n) => ({
      id: n.id,
      kind: n.kind,
      severity: n.severity,
      created_at: n.created_at,
      metadata: n.metadata as Record<string, unknown>,
    }),
  )

  // ─── control_snapshot merger ───────────────────────────────────────
  //
  // Per-field decisions: when the snapshot is non-null with data,
  // route through the engine via synthesised inputs that match the
  // engine's existing input shape; otherwise the engine consumes the
  // base inputs (notifications stream, intelligenceQuery limits) and
  // computes everything client-side as before.
  //
  // FALLBACK INVARIANT: when `controlSnapshot` is null OR the relevant
  // array is empty/null, the engine path is unchanged.
  const snapshotData = controlSnapshotQuery.data ?? null

  const overBudgetFromServer = useMemo<OverBudgetCategoryRow[] | null>(() => {
    const rows = snapshotData?.over_budget_categories
    if (!rows || rows.length === 0) return null
    return rows
  }, [snapshotData])

  // Subs con categoría 'Suscripciones' + status active, derivadas server-side
  // SIN ventana de ciclo. Mapea snake_case del RPC → camelCase del builder.
  // Reemplaza al zombi por ausencia-de-pago (Sistema A retirado 2026-06-23).
  const subscriptionCheckins = useMemo<SubscriptionCheckin[]>(() => {
    const rows = homeSnapshotQuery.data?.subscription_checkins
    if (!rows || rows.length === 0) return []
    return rows.map((r) => ({
      fixedExpenseId: r.fixed_expense_id,
      name: r.name,
      amount: r.amount,
      lastPaymentAt: r.last_payment_at,
      lastAuditAt: r.last_audit_at,
      recentLevels: r.recent_levels ?? [],
      hasOpenCancelIntent: r.open_intent ?? false,
    }))
  }, [homeSnapshotQuery.data])

  const memberPressureFromServer = useMemo<MemberPressureRow[] | null>(() => {
    const rows = snapshotData?.member_pressure
    if (!rows || rows.length === 0) return null
    return rows
  }, [snapshotData])

  const forecastFromServer = useMemo<
    { closeAmount: number; overshootPct: number | null } | null
  >(() => {
    const closeAmount = snapshotData?.forecast_close_amount
    if (closeAmount == null) return null
    return {
      closeAmount,
      overshootPct: snapshotData?.forecast_overshoot_pct ?? null,
    }
  }, [snapshotData])

  // Replace engine `limits` input with synthesised entries when the
  // server reports over-budget categories. Keeps the engine unchanged
  // — it still reads `monthly_cap` + computes spent client-side, but
  // the caps come from the server's authoritative source. We default
  // `warning_threshold_pct` to 80 (the engine compares spent against
  // cap × threshold/100); over-budget rows already have ratio ≥ 1
  // server-side, so the comparison passes regardless.
  const limits = useMemo<CategoryLimit[]>(() => {
    if (!overBudgetFromServer) return limitsBase
    return overBudgetFromServer.map((row) => ({
      id: `snapshot-${row.category_id}`,
      category_id: row.category_id,
      monthly_cap: row.monthly_cap,
      warning_threshold_pct: 80,
    }))
  }, [overBudgetFromServer, limitsBase])

  // Notifs del feed tal cual del server. La síntesis de zombie_alert desde
  // el snapshot (Sistema A) se retiró 2026-06-23: el check-in de uso
  // (buildSubUsageCheckin) reemplaza al zombi por ausencia-de-pago y se
  // alimenta de `subscriptionCheckins`, no de notifications sintéticas.
  const notifications = useMemo<NotificationLite[]>(
    () => notificationsBase,
    [notificationsBase],
  )

  const { usingMock, noConfig } = classifyControlMode({
    finance,
    expensesCount: expenses.length,
  })

  const { cycle: payCycle, isSalaryPendingConfirmation } = usePayCycle(familyId)
  const monthlyAccounting = useMonthlyAccounting(familyId)
  const dismissedHikes = useDismissedHikes()

  // Ingresos extra del ciclo (auditoría 2026-06-11): misma ventana y
  // misma query que Home usa para `cycleExtraIncome` — las dos vistas
  // reportan EL MISMO presupuesto. El total alimenta el adapter
  // (ingreso efectivo) y la lista alimenta la card "Entró este ciclo".
  const incomeStartKey = formatLocalDateKey(monthlyAccounting.start)
  const incomeEndKey = formatLocalDateKey(monthlyAccounting.end)
  const cycleIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    incomeStartKey,
    incomeEndKey,
  )
  const extraIncome = cycleIncomeQuery.data ?? 0
  const incomeEventsQuery = useIncomeEvents(familyId)
  const ingresosCiclo = useMemo<IngresosCiclo>(() => {
    const all = incomeEventsQuery.data ?? []
    const movimientos = all
      .filter((e) => e.event_date >= incomeStartKey && e.event_date < incomeEndKey)
      .map((e) => ({
        id: e.id,
        fecha: e.event_date,
        kind: e.kind,
        descripcion: e.description ?? null,
        monto: Number(e.amount ?? 0),
      }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    return { total: extraIncome, movimientos }
  }, [incomeEventsQuery.data, incomeStartKey, incomeEndKey, extraIncome])
  // Each `useMemo` here delegates to a module-level LRU(1) cache via
  // `singleEntryMemoize`. With three Home-tree invocations sharing the
  // same React Query data identities, the second and third invocations
  // hit cache and the heavy compute only runs once per render cycle.
  // Gate the dev fixture on `noConfig` (income missing) instead of the
  // broader `usingMock`. Once the user finishes onboarding (income
  // configured), the adapter computes a real `data` shape from the
  // empty/sparse expense set — `cupoDiario` is meaningful, and each
  // card renders its own inert empty-state variant (real silhouette,
  // no fake data) until it has enough historical data.
  const data = useMemo<ControlMockData>(() => {
    if (noConfig || !finance) return CONTROL_MOCK
    return memoizedBuildData({
      expenses,
      fixedExpenses,
      finance,
      summaries,
      payCycle,
      monthlyAccounting,
      extraIncome,
    })
  }, [noConfig, expenses, fixedExpenses, finance, summaries, payCycle, monthlyAccounting, extraIncome])

  const view = useMemo<ControlView>(() => memoizedComputeView(data), [data])

  // Velocity FRESCA derivada de los gastos locales (auditoría
  // 2026-06-11). El snapshot del server se computa a la 01:00 AR con
  // los datos presentes EN ESE MOMENTO: las cargas tardías /
  // back-dateadas (típicas con los imports OCR) lo dejan mintiendo el
  // resto del día — caso real medido: avg7 $11.8k vs $135k reales, con
  // stress 'calm' cuando era 'warn'. Derivamos los MISMOS campos con la
  // MISMA semántica del cron (mean simple, forecast = gastado + avg7 ×
  // días restantes, mismos umbrales de stress) desde los días del ciclo
  // que el cliente ya tiene en memoria. El snapshot del server queda
  // como fallback con <7 días cerrados (ciclo joven).
  const freshVelocity = useMemo<VelocitySnapshot | null>(() => {
    const closed = view.detalleDias
    if (closed.length < 7) return velocity
    const sum = (xs: ReadonlyArray<{ gasto: number }>) =>
      xs.reduce((s, x) => s + x.gasto, 0)
    const last7 = closed.slice(-7)
    const last30 = closed.slice(-30)
    const avg7 = sum(last7) / 7
    const avg30 = sum(last30) / Math.max(1, last30.length)
    const momentum = avg30 > 0 ? avg7 / avg30 : 1
    const gastadoCiclo = sum(closed) + data.gastoHoy
    // `diasRestantes` incluye hoy; hoy ya está contado en gastadoCiclo.
    const diasFuturos = Math.max(0, view.diasRestantes - 1)
    const forecast = gastadoCiclo + avg7 * diasFuturos
    // Presupuesto discrecional del ciclo = libreMes REAL del modelo, NO
    // reconstruido como cupoDiario × días: con override el cupo es por día
    // RESTANTE (ya netea el variable gastado), así que multiplicarlo por los
    // días totales re-inflaba el presupuesto y subestimaba el stress_level.
    const libre = view.libreMesTotal
    const stress: VelocitySnapshot['stress_level'] =
      libre <= 0 || forecast > libre * 1.15
        ? 'critical'
        : forecast > libre
          ? 'warn'
          : forecast > libre * 0.85
            ? 'watch'
            : 'calm'
    return {
      snapshot_date: formatLocalDateKey(new Date()),
      avg_daily_last_7: avg7,
      avg_daily_last_30: avg30,
      momentum,
      forecast_close_amount: forecast,
      stress_level: stress,
    }
  }, [view.detalleDias, view.diasRestantes, view.libreMesTotal, data.gastoHoy, velocity])

  const baselines = useMemo(
    () => memoizedComputeBaselines(summaries),
    [summaries],
  )

  const persona = useMemo<UserPersona>(() => {
    // Override manual (user_advisor_prefs) gana sobre la inferencia.
    const prefs = advisorPrefsQuery.data
    if (prefs && !prefs.useInferredPersona && prefs.personaOverride) {
      return prefs.personaOverride
    }
    const stats = interactionStatsQuery.data
    if (!stats) return 'planner'
    return memoizedInferPersona(stats)
  }, [advisorPrefsQuery.data, interactionStatsQuery.data])

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
  // Hoisteado fuera del memo (el compiler no preserva la memo con el
  // optional-chain adentro — mismo patrón que use-monthly-accounting).
  const signalsIncomeMode: 'fixed' | 'dynamic' =
    finance?.income_mode === 'dynamic' ? 'dynamic' : 'fixed'
  const computedSignals = useMemo<ControlAdvisorTask[]>(() => {
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
    // Kill-switch del asistente (user_advisor_prefs.advisor_enabled).
    // Off = no se computan señales; la pantalla muestra "en pausa".
    if (advisorPrefsQuery.data && !advisorPrefsQuery.data.advisorEnabled) return []
    if (usingMock) return resolveControlSignals({ usingMock: true, computedSignals: [] })
    return coerceSignalsToReadOnly(
      memoizedBuildSignals({
        view,
        expenses,
        fixedExpenses,
        categoriesExpense,
        summaries,
        limits,
        velocity: freshVelocity,
        notifications,
        savingsGoal,
        cupoDiario: data.cupoDiario,
        gastoHoy: data.gastoHoy,
        diasRestantes: view.diasRestantes,
        ingresoMes: data.ingresoMes,
        // Sueldo RECURRENTE base (family_finance.monthly_income), sin override
        // ni income_events one-time. Lo consumen `income-missing` (cobro
        // esperado) e `income-volatility` (vs histórico de sueldo) — el override
        // es un ajuste de UN ciclo y no debe entrar en esas comparaciones.
        // DINÁMICO: no hay sueldo — la referencia de ingreso del ciclo son
        // los income_events (extraIncome). ÚNICO punto de verdad de esa
        // referencia para toda la capa de señales.
        ingresoRecurrente:
          signalsIncomeMode === 'dynamic'
            ? Math.max(0, extraIncome)
            : Math.max(0, data.monthlyIncome),
        incomeMode: signalsIncomeMode,
        diasCiclo: Math.max(1, monthlyAccounting.days),
        fijosMes: data.fijosMes,
        dismissedHikes,
        baselines,
        forecast,
        persona,
        paydayPending: isSalaryPendingConfirmation,
        blockedFamilies: blocklistQuery.data,
        subscriptionCheckins,
      }),
    )
  }, [
    demoMode,
    demoFilter,
    usingMock,
    advisorPrefsQuery.data,
    view,
    expenses,
    fixedExpenses,
    categoriesExpense,
    summaries,
    limits,
    freshVelocity,
    notifications,
    savingsGoal,
    data.cupoDiario,
    data.gastoHoy,
    data.ingresoMes,
    data.monthlyIncome,
    data.fijosMes,
    signalsIncomeMode,
    extraIncome,
    monthlyAccounting.days,
    dismissedHikes,
    baselines,
    forecast,
    persona,
    isSalaryPendingConfirmation,
    blocklistQuery.data,
    subscriptionCheckins,
  ])

  // ── Source of truth de las señales VISIBLES ───────────────────────────
  // El filtro de `dismissed` + la noción de "listo" viven ACÁ, no en cada
  // consumidor — así Control, el chip de Gastos, el dot del tab, el push y el
  // asistente reciben EXACTAMENTE el mismo set, consistente. Antes solo el
  // asistente y el badge filtraban dismissed → el resto mostraba/pusheaba
  // señales descartadas. La blocklist ya se aplica arriba (computedSignals).
  const dismissed = useDismissedIds()
  const dismissalsHydrated = useDismissalsHydrated()
  const isLoading =
    expensesQuery.isLoading ||
    fixedExpensesQuery.isLoading ||
    financeQuery.isLoading ||
    categoriesQuery.isLoading ||
    intelligenceQuery.isLoading
  // Exponer las señales SOLO cuando los filtros (blocklist + dismissed) Y las
  // fuentes que las ALIMENTAN cargaron — sino se computan con data parcial y
  // flickean (falsos positivos). Ver `areSignalsReady`.
  const signalsReady = areSignalsReady({
    hasUserId: Boolean(userId),
    blocklistLoaded: blocklistQuery.data !== undefined,
    dismissalsHydrated,
    coreLoading: isLoading,
    prefsLoading: advisorPrefsQuery.isLoading,
    statsLoading: interactionStatsQuery.isLoading,
    snapshotLoading: controlSnapshotQuery.isLoading,
    homeSnapshotLoading: homeSnapshotQuery.isLoading,
  })
  const signals = useMemo<ControlAdvisorTask[]>(() => {
    if (!signalsReady) return EMPTY_SIGNALS
    return computedSignals.filter((t) => !dismissed.has(dismissKeyFor(t)))
  }, [signalsReady, computedSignals, dismissed])

  const controlSnapshot = snapshotData

  // Payload del "Manifiesto Wrapped" del ciclo recién cerrado, listo para
  // disparar el CycleWrappedModal desde la card "VS mes". Reusa el mismo
  // builder que el auto-trigger post-cobro y la pantalla de Ediciones, así
  // la animación es idéntica venga de donde venga. `null` cuando no hay un
  // cierre con gastos para contar.
  const wrappedPayload = useMemo<CycleWrappedPayload | null>(() => {
    const latest = summaries[0]
    if (!latest || (latest.expenses_count ?? 0) === 0) return null
    const categoryNameById = new Map(
      // Display localizado: el Wrapped muestra la categoría top al usuario,
      // así que el mapa debe llevar `displayName` (no el `name` crudo ES).
      categoriesExpense.map((c) => [c.id, c.displayName] as const),
    )
    return buildWrappedPayloadFromSummary({
      summary: latest,
      categoryNameById,
      achievementsEarnedAt: [],
    })
  }, [summaries, categoriesExpense])

  // Seen-state of the freshest closed cycle's Wrapped — drives the header
  // discoverability pulse. `wrappedSummaryId` is the row to mark seen.
  const wrappedSummaryId = wrappedPayload ? (summaries[0]?.id ?? null) : null
  const wrappedSeen = Boolean(summaries[0]?.wrapped_seen_at)

  // Dinámico sin ingresos ESTE ciclo → la pantalla pinta la guía en vez
  // del stack de cards. Gate en `data !== undefined` (no en el ?? 0)
  // para no flashear la guía mientras la query de ingresos hidrata.
  const dynamicNoIncome =
    signalsIncomeMode === 'dynamic' &&
    cycleIncomeQuery.data !== undefined &&
    cycleIncomeQuery.data <= 0

  return {
    data,
    view,
    ingresosCiclo,
    signals,
    signalsReady,
    forecast,
    isLoading,
    usingMock,
    noConfig,
    dynamicNoIncome,
    controlSnapshot,
    wrappedPayload,
    wrappedSummaryId,
    wrappedSeen,
    forecastFromServer,
    overBudgetFromServer,
    memberPressureFromServer,
  }
}

// ─── Intelligence slice (summaries + limits + velocity) ─────────────

export interface ControlIntelligencePayload {
  summaries: MonthlySummaryHistory[]
  limits: CategoryLimit[]
  velocity: VelocitySnapshot | null
}

export { controlIntelligenceQueryKey } from '@/features/insights/control-v2-query-keys'
import { controlIntelligenceQueryKey } from '@/features/insights/control-v2-query-keys'

async function fetchControlIntelligencePayload(
  familyId: string,
): Promise<ControlIntelligencePayload> {
  const [summaries, limits, velocity] = await Promise.all([
    fetchSummaries(familyId),
    fetchLimits(familyId),
    fetchVelocity(familyId),
  ])
  return { summaries, limits, velocity }
}

// Exportado (2026-07-08): el Home lo usa para el auto-fire del Wrapped
// en modo INGRESO DINÁMICO (el path fixed dispara al confirmar cobro,
// acción que no existe en dinámico). Pasar '' como familyId lo apaga.
export function useControlIntelligence(familyId: string) {
  return useQuery<ControlIntelligencePayload>({
    queryKey: controlIntelligenceQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: () => fetchControlIntelligencePayload(familyId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}

/**
 * Prefetch helper — calenta el cache de control-intelligence sin
 * requerir que `useControlV2Data` esté montado. Lo dispara el tabs
 * layout post-home, así cuando el user toca el tab Control la data
 * ya está hot y el screen renderea instantáneo.
 */
export async function prefetchControlIntelligence(
  client: QueryClient,
  familyId: string,
): Promise<void> {
  if (!familyId) return
  await client.prefetchQuery({
    queryKey: controlIntelligenceQueryKey(familyId),
    queryFn: () => fetchControlIntelligencePayload(familyId),
    staleTime: 5 * 60_000,
  })
}

async function fetchSummaries(
  familyId: string,
): Promise<MonthlySummaryHistory[]> {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select(
      'id, period_start, period_end, period_label, total_variable_spent, total_spent, expenses_count, monthly_income, savings_delta, extra_income, savings_goal_amount, category_breakdown, daily_totals, by_member, top_expense, delta_vs_previous_percent, mood, wrapped_seen_at',
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
