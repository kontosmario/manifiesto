// mobile/components/home/home-dashboard.tsx
import { useCallback, useMemo, useState } from 'react'
import { useCurrentDate } from '@/hooks/use-current-date'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { HomeDashboardSheets } from '@/components/home/home-dashboard-sheets'
import { MonthCloseDecisionSheet } from '@/components/home/sheets/month-close-decision-sheet'
import { useIsAuthOverlayVisible } from '@/features/auth-flow/use-auth-flow'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { MetaCard } from '@/components/home/meta-card'
import {
  computeTopCategory,
  computeTopCategoryFallback,
} from '@/components/home/home-top-category-helpers'
import { computeNextFixed } from '@/components/home/home-next-fixed-helpers'
import { computeNextFixedFallback } from '@/components/home/home-next-fixed-fallback'
import { computeSavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import { useTrackElement } from '@/features/home/use-track-element'
import { useCycleSheetAutoOpen } from '@/features/home/use-cycle-confirmation'
import { useMonthCloseOrchestration } from '@/features/home/use-month-close-orchestration'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { StartingBalanceCta } from '@/components/home/starting-balance-cta'
import { CollapsingReveal } from '@/components/home/collapsing-reveal'
import { HomeHeader } from '@/components/home/home-header'
import { FamilyStrip } from '@/components/home/family-strip'
import { MonthSummaryCard } from '@/components/home/month-summary-card'
import { StreakWeekWidget } from '@/components/home/streak-week-widget'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  TourTarget,
  useScreenTour,
  useTourTargetRef,
} from '@/features/tours'
import { useGarden } from '@/features/garden/use-garden'
import type { Expense } from '@/features/expenses/use-expenses'
import type { IncomeEvent } from '@/features/income/use-income-events'
import {
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { useHomeMetrics } from '@/features/home/use-home-metrics'
import { useUsdRate } from '@/features/finance/use-usd-rate'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  logHomeEvent,
  type HomeElementId,
  type HomeSlot,
} from '@/features/home/log-home-event'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import {
  activeFamilyMembers,
  useFamilyMembers,
} from '@/features/family/use-family-members'
import { usePressScale } from '@/hooks/use-press-scale'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { nunitoFamily } from '@/theme/typography'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  /** Income events de la familia — el activity feed los intercala con
   *  los gastos por timestamp desc. */
  recentIncome?: IncomeEvent[]
  categoryNameById: Map<string, string>
  /** category_id → nombre CRUDO (no localizado) de la DB. Fuente para
   *  resolver el ícono/color de cada categoría (los matchers son ES).
   *  El display visible sigue saliendo de `categoryNameById`. */
  categoryRawNameById: Map<string, string>
  /** category_id → color (hex). Tinta el icon tile de cada gasto del feed
   *  por categoría, igual que en Gastos · Movimientos. */
  categoryColorById: Map<string, string>
  familyId: string
  /** Modo solo: el usuario es una familia invisible de 1 (kind='solo').
   *  Oculta los avatares de miembros en el FamilyStrip. */
  isSolo: boolean
  displayName: string
  unreadNotificationsCount?: number
  assistantPendingCount?: number
  /**
   * Sprint R-3 redesign: forwards to HomeHeader's gear-icon dot. True
   * when the user has no biometric and no PIN configured — the only
   * state where Sprints R-1/R-2 lock gates fall through. The previous
   * inline banner has been removed in favor of this ambient signal.
   */
  settingsHasNudge?: boolean
  onPressNotifications?: () => void
  onPressSettings?: () => void
  onPressAssistant?: () => void
  /** Invoked from the hero card's setup state (income not configured)
   *  to drop the user into the income setup flow. */
  onPressConfigureIncome?: () => void
  /** Estado vacío del modo INGRESO DINÁMICO — navega a add-income. */
  onPressAddIncome?: () => void
  isLoadingActivity: boolean
  activityError: unknown
  /**
   * Persists the cycle balance prompt. Pass `null` for "kept default
   * salary" (anchors the cycle but no engine override); pass a number
   * for the user-corrected available amount.
   */
  onConfirmCycleStartingBalance: (startingBalance: number | null) => void
  onDeleteExpense: (expenseId: string) => void
  /** Borra un income event desde el swipe del row en actividad. */
  onDeleteIncome?: (incomeId: string) => void
  pendingDeleteExpenseId?: string | null
  pendingDeleteIncomeId?: string | null
  isSavingSalary: boolean
  salaryErrorMessage: string | null
  /** Telemetry session id from `useHomeTelemetry`. Optional so the
   *  component still works in screens without telemetry wiring. */
  telemetrySessionId?: string
  /** Called when any tracked element is tapped. Lets the parent
   *  (HomeScreen) know the user did at least one thing in this
   *  session — used to suppress `home.left_without_tap`. */
  onMarkTapped?: () => void
}

export function HomeDashboard({
  dashboard,
  recentExpenses,
  recentIncome = [],
  categoryNameById,
  categoryRawNameById,
  categoryColorById,
  familyId,
  isSolo,
  displayName,
  unreadNotificationsCount = 0,
  assistantPendingCount = 0,
  settingsHasNudge = false,
  onPressNotifications,
  onPressSettings,
  onPressAssistant,
  onPressConfigureIncome,
  onPressAddIncome,
  isLoadingActivity,
  activityError,
  onConfirmCycleStartingBalance,
  onDeleteExpense,
  onDeleteIncome,
  pendingDeleteExpenseId,
  pendingDeleteIncomeId,
  isSavingSalary,
  salaryErrorMessage,
  telemetrySessionId,
  onMarkTapped,
}: HomeDashboardProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const today = useCurrentDate()
  const [isCycleBalanceSheetOpen, setCycleBalanceSheetOpen] = useState(false)

  // userId via auth session — necesario para que `syncAllAfterMutation`
  // invalide home_snapshot / control snapshot / streaks tras la
  // decisión (Code review H1, sprint A 2026-06-08).
  const sessionUserId = useAuthSession().data?.user?.id

  // Splash visibility — gate compartido entre el cycle balance prompt
  // y la decisión standalone para que NINGÚN sheet/modal aparezca
  // mientras el overlay de transición (bridge auth / offline) está
  // visible.
  const splashIsHidden = !useIsAuthOverlayVisible()

  // ─── Tour targets that can't be wrapped via <TourTarget> ────────
  // Some targets live inside leaf components (HomeHeader's actions
  // row, the two halves of MonthSummaryCard) where wrapping
  // children is awkward. `useTourTargetRef` registers the step with
  // the tour context and returns a ref the component forwards to
  // its native View — same lifecycle as <TourTarget>, no JSX wrap.
  const headerActionsTourRef = useTourTargetRef(
    HOME_TOUR,
    HOME_TOUR_STEPS.headerActions.order,
    {
      text: HOME_TOUR_STEPS.headerActions.text,
      // Pill-shaped highlight to match the icon row's natural shape.
      highlight: { borderRadius: 24, padding: 8 },
    },
  )
  const variablesTourRef = useTourTargetRef(
    HOME_TOUR,
    HOME_TOUR_STEPS.cycleSummary.order,
    {
      text: HOME_TOUR_STEPS.cycleSummary.text,
      highlight: { borderRadius: 20, padding: 4 },
    },
  )
  const fixedTourRef = useTourTargetRef(
    HOME_TOUR,
    HOME_TOUR_STEPS.cycleSummary.order,
    {
      text: HOME_TOUR_STEPS.cycleSummary.text,
      highlight: { borderRadius: 20, padding: 4 },
    },
  )

  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  // `dashboard.payCycle` viene de `usePayCycle` (Task 6) y respeta los
  // 4 tipos de ciclo. Derivamos el countdown del chip directamente de
  // ahí en vez del legacy `salary_payment_day` que asumía monthly.
  const payCycle = dashboard.payCycle
  // Ciclo en TIEMPO REAL (freeze:false) — solo para las OBLIGACIONES
  // (el próximo fijo a vencer). El saldo sigue usando `payCycle` frozen.
  const { cycle: realCycle } = usePayCycle(familyId, { freeze: false })
  // Dinámico: no existe día de cobro — el pill de payday del FamilyStrip
  // se oculta (days=null → PaydayPillV2 devuelve null) y nunca hay
  // "¿Cobraste?" pendiente.
  const isDynamicIncome = dashboard.incomeMode === 'dynamic'
  const pending = useMemo(
    () =>
      isDynamicIncome
        ? false
        : isPaydayPending({ cycle: payCycle, lastConfirmedAt }, today),
    [isDynamicIncome, payCycle, lastConfirmedAt, today],
  )
  const days = useMemo(
    () => (isDynamicIncome ? null : daysUntilPayday(payCycle, today)),
    [isDynamicIncome, payCycle, today],
  )
  const cycle = useMemo(() => getPaydayCycle(payCycle, today), [payCycle, today])
  void cycle

  const membersQuery = useFamilyMembers(familyId)
  const homeMetrics = useHomeMetrics(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  // Gate del paso `streak` del tour: solo registramos el target cuando
  // StreakWeekWidget realmente renderiza (hay datos de jardín). Es la
  // misma query cacheada que usa el widget → sin fetch extra.
  const gardenForTour = useGarden(familyId, sessionUserId)
  // Memoize array fallbacks. Sin esto cada `?? []` crea un new array
  // reference por render, rompiendo el `React.memo` de FamilyStrip y
  // HomeActivitySection — los hijos memo'd reciben new array y
  // re-renderean en cada parent render (cycle sheet open, etc.).
  // La strip habla del hogar ACTUAL, así que descarta a los bloqueados: el
  // roster crudo los incluye y el conteo quedaba por encima del de Ajustes.
  const familyMembers = useMemo(
    () => activeFamilyMembers(membersQuery.data),
    [membersQuery.data],
  )
  // Actividad del Home = ciclo ACTUAL. Los gastos quedan archivados al cerrar
  // el ciclo (no aparecen), pero los income_events NO se archivan, así que los
  // acotamos a la ventana del ciclo por event_date. Un arrastre ("Sobrante de
  // [mes]") es un income del ciclo donde se sumó; pasado ese ciclo deja de ser
  // relevante y NO debe seguir flotando en la actividad del ciclo nuevo
  // (reporte owner 2026-06-22).
  const cycleIncome = useMemo(() => {
    const startKey = formatLocalDateKey(payCycle.start)
    const endKey = formatLocalDateKey(payCycle.end)
    return recentIncome.filter(
      (e) => e.event_date >= startKey && e.event_date < endKey,
    )
  }, [recentIncome, payCycle.start, payCycle.end])
  const expensesData = useMemo(
    () => dashboard.expensesQuery.data ?? [],
    [dashboard.expensesQuery.data],
  )
  const fixedExpensesData = useMemo(
    () => dashboard.fixedExpensesQuery.data ?? [],
    [dashboard.fixedExpensesQuery.data],
  )
  // Same vault calculation that powers the Control alcancía — sum of
  // positive deltas (cupo - gasto) across closed cycle days. Reading
  // it here so the MetaCard's slider reads "lo que ahorraste este
  // ciclo" instead of the static monthly target. The underlying
  // queries are already cached (home_snapshot warm-up + react-query),
  // so this is essentially free at runtime.
  const controlData = useControlV2Data(familyId)
  const cycleVault = controlData.usingMock ? 0 : controlData.view.vault

  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  // ── Cycle balance prompt — gating ────────────────────────────────
  //
  // The OnboardingAvailableSheet is meant for users who haven't
  // started using the app yet. The moment the user adds an expense
  // (skipping the modal), asking them about "disponible hoy" stops
  // making sense — they've already moved on. We treat that as an
  // implicit "salary is fine as-is" confirmation: silently anchor
  // the cycle so neither sheet auto-opens until the next payday.
  const storedCycleAnchor =
    dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null
  // Only manual gastos count as "the user moved on". Commitment
  // payments (fixed expenses auto-recorded as expense rows when
  // marked paid) are not user-driven activity — they shouldn't
  // suppress the onboarding prompt.
  // Memoized: era O(n) en cada render, ahora solo recomputa cuando
  // expensesData cambia (reference-stable via useMemo arriba).
  const hasManualExpense = useMemo(
    () => expensesData.some((e) => !e.commitment_id),
    [expensesData],
  )
  // DINÁMICO: el flujo "confirmá tu primer saldo" NO existe (no hay
  // cobro que anclar) — anchor null es el estado NATURAL del modo
  // (nadie confirma cobro, y el switch a dinámico lo limpia a
  // propósito). Sin esta exención el usuario quedaba "en onboarding"
  // PARA SIEMPRE: tour del Home deshabilitado y el auto-fire del
  // Wrapped abortando en silencio (reporte del owner 2026-07-08 — el
  // wrapped disparó una sola vez mientras quedaba un anchor del
  // onboarding, y nunca más al limpiarse).
  const onboardingSkippedViaExpense =
    !isDynamicIncome && storedCycleAnchor == null && hasManualExpense
  const isOnboardingFlow = !isDynamicIncome && storedCycleAnchor == null
  // Auto-start the Home guided tour on first visit. Hook is a no-op
  // if the tour was already seen or globally disabled in Settings.
  // Gated on !isOnboardingFlow: we wait for the user to confirm the
  // cycle starting balance before firing the tour. Otherwise the tour
  // overlay and the saldo-CTA bottom sheet stack as two Modals (iOS
  // gets glitched: scrim renders invisible, touches captured silently).
  // Once the balance is confirmed, isOnboardingFlow flips false and
  // the tour fires normally.
  useScreenTour(HOME_TOUR, { enabled: !isOnboardingFlow })

  // Silent-anchor del onboarding dropeado (guard de ownership incluido)
  // + gating/auto-open del cycle balance sheet — extraídos LITERAL a
  // useCycleSheetAutoOpen (FASE 0 del rediseño). El hook escribe en
  // setCycleBalanceSheetOpen; la lógica y sus gates no cambiaron.
  useCycleSheetAutoOpen({
    dashboard,
    familyId,
    sessionUserId,
    isOnboardingFlow,
    onboardingSkippedViaExpense,
    pending,
    splashIsHidden,
    onConfirmCycleStartingBalance,
    setCycleBalanceSheetOpen,
  })

  const handleChipConfirm = useCallback(() => {
    // Open the cycle prompt when there's something to do:
    //  - payday is past + not confirmed (`pending`),
    //  - the cycle hasn't been anchored yet (`isCycleStartingBalancePromptPending`),
    //  - or today is literally the payday day (`days === 0`) so the
    //    user can confirm what they actually received this cycle.
    if (
      !pending &&
      !dashboard.isCycleStartingBalancePromptPending &&
      days !== 0
    ) {
      return
    }
    setCycleBalanceSheetOpen(true)
  }, [pending, dashboard.isCycleStartingBalancePromptPending, days])
  const handleCycleSheetClose = useCallback(() => {
    if (isSavingSalary) return
    setCycleBalanceSheetOpen(false)
  }, [isSavingSalary])

  const activeGoalForSheet = useMemo(() => {
    const g = savingsGoalQuery.data
    if (!g) return null
    if (g.isActive === false) return null
    // Montos incluidos: la barra de progreso de la opción "Destinar a mi
    // meta" del wrapped (pantalla 06) los necesita.
    return {
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      currentAmount: g.currentAmount,
      goalAmount: g.goalAmount,
    }
  }, [savingsGoalQuery.data])

  // Orquestación del cierre de mes (wrapped + decisión del sobrante) —
  // extraída LITERAL a useMonthCloseOrchestration (FASE 0 del rediseño):
  // pendingDecision, el sheet de decisión, fireWrappedForClosedCycle y
  // el auto-fire dinámico viven ahí con los mismos gates y locks.
  const {
    pendingDecision,
    decisionSheetOpen,
    applyDecision,
    handleApplyDecision,
    handleSkipDecision,
    handleDecisionSheetClose,
    fireWrappedForClosedCycle,
  } = useMonthCloseOrchestration({
    familyId,
    sessionUserId,
    isOnboardingFlow,
    isDynamicIncome,
    pending,
    splashIsHidden,
    categoryNameById,
    activeGoalForSheet,
    t,
  })

  const handleCycleSheetSave = useCallback((amount: number) => {
    onConfirmCycleStartingBalance(amount)
    setCycleBalanceSheetOpen(false)
    void fireWrappedForClosedCycle()
  }, [onConfirmCycleStartingBalance, fireWrappedForClosedCycle])
  const handleCycleSheetKeepDefault = useCallback(() => {
    onConfirmCycleStartingBalance(null)
    setCycleBalanceSheetOpen(false)
    void fireWrappedForClosedCycle()
  }, [onConfirmCycleStartingBalance, fireWrappedForClosedCycle])
  // Which prompt to render is driven solely by whether the user has
  // already gone through the one-shot post-onboarding setup:
  //   • storedAnchor == null  → never resolved → onboarding sheet.
  //   • storedAnchor != null  → already in the recurring loop;
  //     when the prompt is pending, it's because payday rolled in
  //     and the user hasn't confirmed → salary confirmation sheet.
  // The "skipped via expense" branch silently anchors before this
  // computes, so by the time it matters `storedCycleAnchor` is set.
  // `isOnboardingFlow` is declared above for the auto-open gate.
  const remainingDaysInCycle = Math.max(1, dashboard.remainingUntilPayday)
  // Telemetry helper: fires a tap event AND marks the session as
  // tapped so HomeScreen can suppress `home.left_without_tap`. No-op
  // when the parent didn't pass telemetry props (e.g. tests).
  const trackTap = useCallback(
    (
      elementId: HomeElementId,
      slot: HomeSlot,
      destinationRoute?: string,
    ) => {
      onMarkTapped?.()
      if (!telemetrySessionId) return
      void logHomeEvent({
        familyId,
        event: 'home.element_tapped',
        elementId,
        slot,
        context: {
          session_id: telemetrySessionId,
          destination_route: destinationRoute ?? null,
        },
      })
    },
    [familyId, telemetrySessionId, onMarkTapped],
  )

  // Press scale para el "Ver todos" link — el opacity-only que tenía
  // antes no transmitía sensación de tap. Spring scale 0.97 lo hace
  // feel Emil-grade sin ser ruidoso (el link es secundario).
  const viewAllPress = usePressScale({ pressedScale: 0.96 })

  const handleViewGastos = useCallback(() => {
    trackTap('month_summary_variables', 'S5', '/(app)/(tabs)/expenses')
    router.push('/(app)/(tabs)/expenses')
  }, [router, trackTap])
  const handleViewFijos = useCallback(() => {
    trackTap('month_summary_fixed', 'S5', '/(app)/(tabs)/fixed-expenses')
    router.push('/(app)/(tabs)/fixed-expenses')
  }, [router, trackTap])
  const handleActivityRetry = useCallback(() => {
    void dashboard.refetchAll()
  }, [dashboard])

  // Wrap header callbacks so each one emits a tap event before
  // delegating to the parent's handler. Wrappers are memoized so the
  // memoized HomeHeader child sees stable identities.
  const handlePressNotifications = useCallback(() => {
    trackTap('header_bell', 'S1', '/(app)/notifications')
    onPressNotifications?.()
  }, [trackTap, onPressNotifications])
  const handlePressSettings = useCallback(() => {
    trackTap('header_settings', 'S1', '/(app)/settings')
    onPressSettings?.()
  }, [trackTap, onPressSettings])
  const handlePressAssistant = useCallback(() => {
    trackTap('header_assistant', 'S1', '/(app)/asistente')
    onPressAssistant?.()
  }, [trackTap, onPressAssistant])
  const handlePressConfigureIncome = useCallback(() => {
    trackTap('hero_setup_cta', 'S3', '/(app)/settings')
    onPressConfigureIncome?.()
  }, [trackTap, onPressConfigureIncome])
  const handlePressAddIncome = useCallback(() => {
    trackTap('hero_add_income_cta', 'S3', '/(app)/add-income')
    onPressAddIncome?.()
  }, [trackTap, onPressAddIncome])

  // Wrap the cycle prompt confirm so we capture taps on the payday
  // pill / cycle adjusted chip before opening the sheet.
  const handleChipConfirmTracked = useCallback(() => {
    trackTap('payday_pill', 'S2')
    handleChipConfirm()
  }, [trackTap, handleChipConfirm])

  // Activity row delete is a destructive action — capture it as a
  // distinct tap so analytics can spot patterns of mis-taps.
  const handleDeleteExpenseTracked = useCallback(
    (expenseId: string) => {
      trackTap('activity_row', 'S7')
      onDeleteExpense(expenseId)
    },
    [trackTap, onDeleteExpense],
  )

  // Sprint 2A — Top category chip (S5 / Variables panel).
  // Computed from the cached cycle expenses + categories. Memoized
  // off the same identities so the heavy aggregation runs only when
  // the inputs actually change.
  const topCategory = useMemo(
    () =>
      computeTopCategory({
        expenses: expensesData,
        cycleStart: dashboard.payCycle.start,
        cycleEnd: dashboard.payCycle.end,
        categoryNameById,
        categoryRawNameById,
      }),
    [
      expensesData,
      dashboard.payCycle.start,
      dashboard.payCycle.end,
      categoryNameById,
      categoryRawNameById,
    ],
  )
  const topCategoryTracker = useTrackElement({
    familyId,
    sessionId: telemetrySessionId ?? '',
    elementId: 'top_category_chip',
    slot: 'S5',
    isVisible: topCategory != null,
  })

  // Fallback band for the Variables card when `computeTopCategory`
  // can't surface a leader yet (early cycle / sparse / empty). Keeps
  // the band slot populated so the two MonthSummary cards stay
  // symmetric with the Fijos "Todos pagados" / próximo-fijo bands.
  const topCategoryFallback = useMemo(
    () =>
      computeTopCategoryFallback({
        topCategory,
        variableCount: homeMetrics.monthSummary.variableCount,
      }),
    [topCategory, homeMetrics.monthSummary.variableCount],
  )
  const handleTopCategoryFallbackPress = useCallback(() => {
    onMarkTapped?.()
    void triggerHaptic('selection')
    // Direct push to the modal route (same pattern the Fijos empty
    // band uses). Pushing to the `(tabs)/add` placeholder works
    // functionally — that route is just a `<Redirect>` to
    // `/(app)/add-expense` — but it briefly mounts the tab, then
    // navigates again, which makes the empty-state CTA feel
    // qualitatively different from "Carga tu primer gasto fijo"
    // (which goes straight to its modal). Skipping the redirect
    // gives both bands the same modal presentation animation.
    router.push('/(app)/add-expense')
  }, [router, onMarkTapped])
  const handleTopCategoryPress = useCallback(
    (categoryId: string) => {
      onMarkTapped?.()
      topCategoryTracker.onTap('/(app)/(tabs)/expenses')
      router.push({
        pathname: '/(app)/(tabs)/expenses',
        params: categoryId ? { categoryId } : {},
      })
    },
    [router, topCategoryTracker, onMarkTapped],
  )

  // Sprint 2B — Próximo fijo chip (S5 / Fijos panel).
  const nextFixed = useMemo(
    () =>
      computeNextFixed({
        fixedExpenses: fixedExpensesData,
        // Ciclo REAL (no el frozen): si el cobro no está confirmado, el
        // próximo fijo a vencer igual debe aparecer (obligaciones en
        // tiempo real). Con el frozen quedaba excluido (>= cycle viejo).
        cycleEnd: realCycle.end,
      }),
    [fixedExpensesData, realCycle.end],
  )
  const nextFixedTracker = useTrackElement({
    familyId,
    sessionId: telemetrySessionId ?? '',
    elementId: 'next_fixed_chip',
    slot: 'S5',
    isVisible: nextFixed != null,
  })
  const handleNextFixedPress = useCallback(
    (fixedExpenseId: string) => {
      onMarkTapped?.()
      nextFixedTracker.onTap('/(app)/(tabs)/fixed-expenses')
      router.push({
        pathname: '/(app)/(tabs)/fixed-expenses',
        params: fixedExpenseId ? { focusFixedExpenseId: fixedExpenseId } : {},
      })
    },
    [router, nextFixedTracker, onMarkTapped],
  )

  // Empty-state band for the Fijos panel — symmetric counterpart to
  // the Variables `topCategoryFallback`. Renders only when the user
  // has no fijos at all (the "all paid" band covers the everything-paid
  // case, the próximo-fijo chip covers active fijos).
  const nextFixedFallback = useMemo(
    () =>
      computeNextFixedFallback({
        fixedCount: homeMetrics.monthSummary.fixedCount,
        hasNextFixed: nextFixed != null,
      }),
    [homeMetrics.monthSummary.fixedCount, nextFixed],
  )
  const handleNextFixedFallbackPress = useCallback(() => {
    onMarkTapped?.()
    void triggerHaptic('selection')
    router.push('/(app)/add-fixed-expense')
  }, [router, onMarkTapped])

  // Sprint 3 — Forecast trend (renders inside the hero card via
  // HomeHeroCard's `projectedCloseTrend` prop). Tracker fires when
  // the trend is actually rendered (projection reliable AND
  // comparison data exists). The user can't tap the trend line —
  // it's informational — so only `home.element_shown` fires here.
  const projectedCloseTrend = homeMetrics.monthSummary.variableTrend
  useTrackElement({
    familyId,
    sessionId: telemetrySessionId ?? '',
    elementId: 'forecast_summary',
    slot: 'S3',
    isVisible:
      homeMetrics.hero.projectionReliable && projectedCloseTrend != null,
  })

  // "Apartando ahorro" chip — read-only caption inside the hero,
  // visible when the user has configured a monthly savings target.
  // The dashboard model already prorates for cycle-balance overrides
  // and clamps `savingsRemaining` to ≥ 0, so we feed those values
  // straight into the pure helper.
  // Cotización en dólares para la línea susurro del hero. Gateada por el toggle
  // (usd_rate_enabled) + moneda ≠ USD; el hook queda disabled si no aplica (no
  // fetchea). El equivalente del saldo se recalcula solo cuando cambia el saldo
  // o el rate. null en loading/off/USD → el hero no muestra la línea.
  const usdRateCurrency = dashboard.familyFinanceQuery.data?.local_currency ?? null
  const usdRateEnabled =
    (dashboard.familyFinanceQuery.data?.usd_rate_enabled ?? false) &&
    !!usdRateCurrency &&
    usdRateCurrency !== 'USD'
  const usdRateQuery = useUsdRate(
    usdRateEnabled && usdRateCurrency ? usdRateCurrency : undefined,
  )
  const usdConversion = useMemo(() => {
    const rate = usdRateQuery.data
    if (!usdRateEnabled || !rate || !homeMetrics.hero.incomeConfigured) return null
    if (!Number.isFinite(rate.ratePerUsd) || rate.ratePerUsd <= 0) return null
    return { saldoUsd: homeMetrics.hero.availableToday / rate.ratePerUsd }
  }, [
    usdRateEnabled,
    usdRateQuery.data,
    homeMetrics.hero.availableToday,
    homeMetrics.hero.incomeConfigured,
  ])

  const savingsChip = useMemo(
    () =>
      // Dinámico: el ahorro mensual por % del sueldo no existe — gate
      // explícito (no depender de que savings_goal esté en 0).
      isDynamicIncome
        ? null
        : computeSavingsHeroChip({
            savingsGoal: dashboard.savingsGoal,
            savingsRemaining: dashboard.savingsRemaining,
            savingsGoalPercent: dashboard.savingsGoalPercent,
            incomeConfigured: homeMetrics.hero.incomeConfigured,
          }),
    [
      isDynamicIncome,
      dashboard.savingsGoal,
      dashboard.savingsRemaining,
      dashboard.savingsGoalPercent,
      homeMetrics.hero.incomeConfigured,
    ],
  )

  return (
    <View style={styles.stack}>
      <HomeHeader
        name={displayName}
        unreadNotificationsCount={unreadNotificationsCount}
        assistantPendingCount={assistantPendingCount}
        settingsHasNudge={settingsHasNudge}
        onPressNotifications={handlePressNotifications}
        onPressSettings={handlePressSettings}
        onPressAssistant={handlePressAssistant}
        actionsRef={headerActionsTourRef}
      />
      {/* Paso familyStrip del tour — 4 ramas por (modo, solo):
          · dinámico+solo: SKIP total (sin pill de payday ni avatares la
            fila queda vacía — highlightearla confunde; el paso no se
            registra y el tour lo saltea solo).
          · dinámico+familia: variante sin "cobro" (familyStripDynamic).
          · fijo+solo: variante sin "grupo familiar" (familyStripSolo).
          · fijo+familia: copy original.
          La strip se define UNA sola vez (familyStripNode) — solo varía
          el wrapper del tour. */}
      {(() => {
        const familyStripNode = (
          <FamilyStrip
            members={familyMembers}
            daysUntilPayday={days}
            paydayPending={pending}
            onPaydayPress={handleChipConfirmTracked}
            showMembers={!isSolo}
          />
        )
        if (isDynamicIncome && isSolo) return familyStripNode
        return (
          <TourTarget
            tour={HOME_TOUR}
            order={HOME_TOUR_STEPS.familyStrip.order}
            text={
              isDynamicIncome
                ? t('states:tour.home.familyStripDynamic')
                : isSolo
                  ? t('states:tour.home.familyStripSolo')
                  : HOME_TOUR_STEPS.familyStrip.text
            }
          >
            {familyStripNode}
          </TourTarget>
        )
      })()}
      {/* La card de "confirma tu saldo" se confirma DENTRO de un Modal
          full-screen (NumericEditSheet). Si la desmontáramos al instante en
          que el dato flippea, el colapso correría OCULTO detrás del modal y la
          card "desaparecía de golpe" al revelarse Home. CollapsingReveal la
          mantiene montada, espera ~320ms a que el modal termine de cerrarse, y
          recién ahí colapsa altura + fade sobre el Home ya visible → el hero de
          abajo sube suave sin salto. El tour de Home (startDelay 600ms, gateado
          a post-confirm) arranca después, así que no compite con el colapso. */}
      <CollapsingReveal
        visible={
          isOnboardingFlow && !onboardingSkippedViaExpense && dashboard.monthlyIncome > 0
        }
        hideDelayMs={320}
        style={{ paddingBottom: 12 }}
      >
        <StartingBalanceCta
          tourOrder={99}
          onPress={() => setCycleBalanceSheetOpen(true)}
        />
      </CollapsingReveal>
      <TourTarget
        tour={HOME_TOUR}
        order={HOME_TOUR_STEPS.hero.order}
        // Dinámico: la ventana del hero ES el ciclo elegido — "a fin de
        // mes" solo es cierto en fijo (accounting mensual).
        text={
          isDynamicIncome
            ? t('states:tour.home.heroDynamic')
            : HOME_TOUR_STEPS.hero.text
        }
      >
        <HomeHeroCard
          data={homeMetrics.hero}
          onPressConfigureIncome={handlePressConfigureIncome}
          onPressAddIncome={handlePressAddIncome}
          projectedCloseTrend={projectedCloseTrend}
          savingsChip={savingsChip}
          usdConversion={usdConversion}
        />
      </TourTarget>
      {/* Variables + Fijos halves of MonthSummaryCard register as
          two separate steps via the refs above. The card renders
          unchanged — only the column wrappers carry the refs. */}
      <MonthSummaryCard
        data={homeMetrics.monthSummary}
        cobroPending={pending}
        onPressVariable={handleViewGastos}
        onPressFixed={handleViewFijos}
        topCategory={topCategory}
        onPressTopCategory={handleTopCategoryPress}
        topCategoryFallback={topCategoryFallback}
        onPressTopCategoryFallback={handleTopCategoryFallbackPress}
        nextFixed={nextFixed}
        onPressNextFixed={handleNextFixedPress}
        nextFixedFallback={nextFixedFallback}
        onPressNextFixedFallback={handleNextFixedFallbackPress}
        variableRef={variablesTourRef}
        fixedRef={fixedTourRef}
      />
      {savingsGoalQuery.data ? (
        <TourTarget
          tour={HOME_TOUR}
          order={HOME_TOUR_STEPS.meta.order}
          text={HOME_TOUR_STEPS.meta.text}
        >
          <MetaCard
            goal={savingsGoalQuery.data}
            enableQuickAdd
            suggestedAmount={cycleVault}
          />
        </TourTarget>
      ) : null}

      {/* Racha del jardín — pegada a Actividad: la racha es tu hábito de registrar,
          y así no interrumpe el par saldo↔variables/fijos. El TourTarget solo
          envuelve cuando hay datos (igual que `meta`), para no registrar un
          target vacío cuando el widget se renderiza como null. */}
      {gardenForTour.data ? (
        <TourTarget
          tour={HOME_TOUR}
          order={HOME_TOUR_STEPS.streak.order}
          text={HOME_TOUR_STEPS.streak.text}
        >
          <StreakWeekWidget familyId={familyId} userId={sessionUserId} />
        </TourTarget>
      ) : null}
      <View style={styles.activityHeader}>
        <Text style={[styles.activityLabel, { color: theme.colors.textMuted }]}>{t('home:dashboard.activity')}</Text>
        {recentExpenses.length > 0 || cycleIncome.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home:dashboard.viewAllHistory')}
            hitSlop={10}
            onPress={handleViewGastos}
            onPressIn={viewAllPress.onPressIn}
            onPressOut={viewAllPress.onPressOut}
          >
            <Animated.View style={viewAllPress.animatedStyle}>
              <Text style={[styles.activityLink, { color: theme.colors.primaryStrong }]}>
                {t('home:dashboard.viewAll')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}
      </View>
      <TourTarget
        tour={HOME_TOUR}
        order={HOME_TOUR_STEPS.activity.order}
        text={HOME_TOUR_STEPS.activity.text}
      >
        <HomeActivitySection
          expenses={recentExpenses}
          incomeEvents={cycleIncome}
          categoryNameById={categoryNameById}
          categoryRawNameById={categoryRawNameById}
          categoryColorById={categoryColorById}
          familyMembers={familyMembers}
          isLoading={isLoadingActivity}
          errorKind={activityErrorKind}
          onDelete={handleDeleteExpenseTracked}
          onDeleteIncome={onDeleteIncome}
          pendingExpenseId={pendingDeleteExpenseId ?? null}
          pendingIncomeId={pendingDeleteIncomeId ?? null}
          onRetry={handleActivityRetry}
        />
      </TourTarget>

      <View style={styles.bottomSpacer} />

      <HomeDashboardSheets
        isOpen={isCycleBalanceSheetOpen}
        isOnboardingFlow={isOnboardingFlow}
        monthlyIncome={dashboard.monthlyIncome}
        remainingDaysInCycle={remainingDaysInCycle}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onClose={handleCycleSheetClose}
        onSaveBalance={handleCycleSheetSave}
        onKeepDefault={handleCycleSheetKeepDefault}
      />
      {pendingDecision ? (
        <MonthCloseDecisionSheet
          visible={decisionSheetOpen}
          pending={pendingDecision}
          activeGoal={activeGoalForSheet}
          nextCycleAnchor={formatLocalDateKey(dashboard.monthlyAccounting.start)}
          onApply={handleApplyDecision}
          onSkip={handleSkipDecision}
          onClose={handleDecisionSheetClose}
          isApplying={applyDecision.isPending}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  activityLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', fontFamily: nunitoFamily('700') },
  activityLink: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700') },
  bottomSpacer: { height: 0 },
})
