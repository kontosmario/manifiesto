// mobile/components/home/home-dashboard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCurrentDate } from '@/hooks/use-current-date'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { HomeDashboardSheets } from '@/components/home/home-dashboard-sheets'
import { MetaCard } from '@/components/home/meta-card'
import { MetaEmptyCard } from '@/components/home/meta-empty-card'
import {
  computeTopCategory,
  computeTopCategoryFallback,
} from '@/components/home/home-top-category-helpers'
import { computeNextFixed } from '@/components/home/home-next-fixed-helpers'
import { computeNextFixedFallback } from '@/components/home/home-next-fixed-fallback'
import { computeSavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import { useTrackElement } from '@/features/home/use-track-element'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { HomeHeader } from '@/components/home/home-header'
import { FamilyStrip } from '@/components/home/family-strip'
import { MonthSummaryCard } from '@/components/home/month-summary-card'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  TourTarget,
  useScreenTour,
  useTourTargetRef,
} from '@/features/tours'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { useHomeMetrics } from '@/features/home/use-home-metrics'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  logHomeEvent,
  type HomeElementId,
  type HomeSlot,
} from '@/features/home/log-home-event'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { triggerCycleWrapped } from '@/lib/cycle-wrapped-emitter'
import { buildWrappedPayloadFromSummary } from '@/features/wrapped/build-wrapped-payload'
import { controlIntelligenceQueryKey } from '@/features/insights/use-control-v2-data'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import { useQueryClient } from '@tanstack/react-query'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  categoryNameById: Map<string, string>
  familyId: string
  /** Modo solo: el usuario es una familia invisible de 1 (kind='solo').
   *  Oculta los avatares de miembros en el FamilyStrip. */
  isSolo: boolean
  displayName: string
  unreadNotificationsCount?: number
  assistantPendingCount?: number
  onPressNotifications?: () => void
  onPressSettings?: () => void
  onPressAssistant?: () => void
  /** Invoked from the hero card's setup state (income not configured)
   *  to drop the user into the income setup flow. */
  onPressConfigureIncome?: () => void
  isLoadingActivity: boolean
  activityError: unknown
  /**
   * Persists the cycle balance prompt. Pass `null` for "kept default
   * salary" (anchors the cycle but no engine override); pass a number
   * for the user-corrected available amount.
   */
  onConfirmCycleStartingBalance: (startingBalance: number | null) => void
  onDeleteExpense: (expenseId: string) => void
  pendingDeleteExpenseId?: string | null
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
  categoryNameById,
  familyId,
  isSolo,
  displayName,
  unreadNotificationsCount = 0,
  assistantPendingCount = 0,
  onPressNotifications,
  onPressSettings,
  onPressAssistant,
  onPressConfigureIncome,
  isLoadingActivity,
  activityError,
  onConfirmCycleStartingBalance,
  onDeleteExpense,
  pendingDeleteExpenseId,
  isSavingSalary,
  salaryErrorMessage,
  telemetrySessionId,
  onMarkTapped,
}: HomeDashboardProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const today = useCurrentDate()
  const queryClient = useQueryClient()
  // Auto-start the Home guided tour on first visit. Hook is a no-op
  // if the tour was already seen or globally disabled in Settings.
  useScreenTour(HOME_TOUR)
  const [isCycleBalanceSheetOpen, setCycleBalanceSheetOpen] = useState(false)

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
    HOME_TOUR_STEPS.variables.order,
    {
      text: HOME_TOUR_STEPS.variables.text,
      highlight: { borderRadius: 20, padding: 4 },
    },
  )
  const fixedTourRef = useTourTargetRef(
    HOME_TOUR,
    HOME_TOUR_STEPS.fixed.order,
    {
      text: HOME_TOUR_STEPS.fixed.text,
      highlight: { borderRadius: 20, padding: 4 },
    },
  )

  const paymentDay = dashboard.familyFinanceQuery.data?.salary_payment_day ?? null
  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const pending = useMemo(
    () => isPaydayPending({ paymentDay, lastConfirmedAt }, today),
    [paymentDay, lastConfirmedAt, today],
  )
  const days = useMemo(() => daysUntilPayday({ paymentDay }, today), [paymentDay, today])
  const cycle = useMemo(() => getPaydayCycle({ paymentDay }, today), [paymentDay, today])
  void cycle

  const membersQuery = useFamilyMembers(familyId)
  const homeMetrics = useHomeMetrics(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  // Memoize array fallbacks. Sin esto cada `?? []` crea un new array
  // reference por render, rompiendo el `React.memo` de FamilyStrip y
  // HomeActivitySection — los hijos memo'd reciben new array y
  // re-renderean en cada parent render (cycle sheet open, etc.).
  const familyMembers = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data],
  )
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
  const onboardingSkippedViaExpense = storedCycleAnchor == null && hasManualExpense
  const isOnboardingFlow = storedCycleAnchor == null

  // Side-effect: when the user dropped the onboarding sheet by
  // adding an expense, write a neutral cycle anchor in the
  // background. Same backend payload as tapping "Tengo el sueldo
  // completo" on the modal (balance=null, anchor=cycleAnchorTarget,
  // lastSalaryConfirmedAt=now). Refetch flips the condition off so
  // this effect fires at most once per dropped onboarding.
  const silentAnchorWroteRef = useRef(false)
  useEffect(() => {
    if (!onboardingSkippedViaExpense) {
      silentAnchorWroteRef.current = false
      return
    }
    if (silentAnchorWroteRef.current) return
    if (dashboard.familyFinanceQuery.isLoading) return
    if (dashboard.expensesQuery.isLoading) return
    silentAnchorWroteRef.current = true
    onConfirmCycleStartingBalance(null)
  }, [
    onboardingSkippedViaExpense,
    dashboard.familyFinanceQuery.isLoading,
    dashboard.expensesQuery.isLoading,
    onConfirmCycleStartingBalance,
  ])

  const shouldAutoOpenCycleSheet =
    dashboard.isCycleStartingBalancePromptPending &&
    !dashboard.familyFinanceQuery.isLoading &&
    Boolean(dashboard.familyFinanceQuery.data) &&
    dashboard.monthlyIncome > 0 &&
    // For users already in the recurring loop, only auto-open the
    // salary-confirmation prompt once payday has actually arrived
    // this cycle and the user hasn't confirmed yet (`pending`).
    // Without this gate, editing `salary_payment_day` in Settings
    // recomputes `cycleAnchorTarget`, the previous anchor stops
    // matching, and the prompt fires mid-cycle even though the new
    // payday is still in the future. Onboarding flow is exempt:
    // those users haven't anchored a cycle yet, so we always ask.
    (isOnboardingFlow || pending) &&
    // Once the onboarding sheet has been dropped via an expense,
    // we silently anchor the cycle (effect above) — never reopen.
    !onboardingSkippedViaExpense
  useEffect(() => {
    if (!shouldAutoOpenCycleSheet) return
    // Wait for the dashboard's hero + cards to finish their RiseView
    // entrance animations (the longest delay in the chain is ~320ms;
    // we add some padding so the screen "settles" first). Letting
    // the user register the dashboard before the sheet emerges makes
    // the prompt feel like a soft follow-up instead of an ambush —
    // and gives us a clean spring-up motion underneath.
    const handle = setTimeout(() => {
      void triggerHaptic('selection')
      setCycleBalanceSheetOpen(true)
    }, 650)
    return () => clearTimeout(handle)
  }, [shouldAutoOpenCycleSheet])

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
  // Dispara el "Manifiesto Wrapped" del ciclo recién cerrado. Gating:
  //   - Solo en flow recurrente (NO en onboarding — el primer cobro
  //     no cierra nada).
  //   - Skip si no hay summary (race / primer cobro / familia nueva).
  //   - Skip si la summary no tiene gastos (ciclo vacío, no hay
  //     historia que contar).
  // El DB trigger `trg_family_finance_salary_confirm` cierra el ciclo
  // sync con el upsert. Por eso esperamos 700ms (post-haptic) y luego
  // invalidamos la cache + refetch para leer la summary fresca.
  const fireWrappedForClosedCycle = useCallback(async () => {
    if (isOnboardingFlow) return
    await new Promise<void>((resolve) => setTimeout(resolve, 700))
    await queryClient.refetchQueries({
      queryKey: controlIntelligenceQueryKey(familyId),
      type: 'active',
    })
    const fresh = queryClient.getQueryData<{
      summaries: MonthlySummaryHistory[]
    }>(controlIntelligenceQueryKey(familyId))
    const latest = fresh?.summaries?.[0]
    if (!latest) return
    if ((latest.expenses_count ?? 0) === 0) return
    triggerCycleWrapped(
      buildWrappedPayloadFromSummary({
        summary: latest,
        categoryNameById,
        achievementsEarnedAt: [],
      }),
    )
  }, [isOnboardingFlow, queryClient, familyId, categoryNameById])

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
      }),
    [
      expensesData,
      dashboard.payCycle.start,
      dashboard.payCycle.end,
      categoryNameById,
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
        // Scope to the current pay cycle: once the user pays a fijo
        // and its `next_due_on` rolls forward to the next cycle, we
        // stop surfacing it as pending here.
        cycleEnd: dashboard.payCycle.end,
      }),
    [fixedExpensesData, dashboard.payCycle.end],
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
  const savingsChip = useMemo(
    () =>
      computeSavingsHeroChip({
        savingsGoal: dashboard.savingsGoal,
        savingsRemaining: dashboard.savingsRemaining,
        savingsGoalPercent: dashboard.savingsGoalPercent,
        incomeConfigured: homeMetrics.hero.incomeConfigured,
      }),
    [
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
        onPressNotifications={handlePressNotifications}
        onPressSettings={handlePressSettings}
        onPressAssistant={handlePressAssistant}
        actionsRef={headerActionsTourRef}
      />
      <TourTarget
        tour={HOME_TOUR}
        order={HOME_TOUR_STEPS.familyStrip.order}
        text={HOME_TOUR_STEPS.familyStrip.text}
      >
        <FamilyStrip
          members={familyMembers}
          daysUntilPayday={days}
          paydayPending={pending}
          onPaydayPress={handleChipConfirmTracked}
          showMembers={!isSolo}
        />
      </TourTarget>
      <TourTarget
        tour={HOME_TOUR}
        order={HOME_TOUR_STEPS.hero.order}
        text={HOME_TOUR_STEPS.hero.text}
      >
        <HomeHeroCard
          data={homeMetrics.hero}
          onPressConfigureIncome={handlePressConfigureIncome}
          projectedCloseTrend={projectedCloseTrend}
          savingsChip={savingsChip}
        />
      </TourTarget>
      {/* Variables + Fijos halves of MonthSummaryCard register as
          two separate steps via the refs above. The card renders
          unchanged — only the column wrappers carry the refs. */}
      <MonthSummaryCard
        data={homeMetrics.monthSummary}
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
      ) : (
        // No tour step when the user hasn't configured a goal yet —
        // explaining a card they don't have would be confusing.
        <MetaEmptyCard />
      )}

      <View style={styles.activityHeader}>
        <Text style={[styles.activityLabel, { color: theme.colors.textMuted }]}>ACTIVIDAD</Text>
        {recentExpenses.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todo el historial"
            hitSlop={10}
            onPress={handleViewGastos}
            onPressIn={viewAllPress.onPressIn}
            onPressOut={viewAllPress.onPressOut}
          >
            <Animated.View style={viewAllPress.animatedStyle}>
              <Text style={[styles.activityLink, { color: theme.colors.primaryStrong }]}>
                Ver todos
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
          categoryNameById={categoryNameById}
          familyMembers={familyMembers}
          isLoading={isLoadingActivity}
          errorKind={activityErrorKind}
          onDelete={handleDeleteExpenseTracked}
          pendingExpenseId={pendingDeleteExpenseId ?? null}
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
  activityLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  activityLink: { fontSize: 14, fontWeight: '700' },
  bottomSpacer: { height: 0 },
})
