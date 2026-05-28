import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  RefreshControl,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { HomeDashboard } from '@/components/home/home-dashboard'
import { brand } from '@/theme/palette'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useCategories } from '@/features/categories/use-categories'
import { useDeleteExpense, useRecentExpenses } from '@/features/expenses/use-expenses'
import { useIsSolo } from '@/features/family/use-is-solo'
import {
  buildCycleStartingBalanceInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useMyProfile } from '@/features/profile/use-profile'
import { useUnreadNotificationsCount } from '@/features/notifications/use-notifications'
import { useHomeRealtime } from '@/features/home/use-home-realtime'
import { useHomeTelemetry } from '@/features/home/use-home-telemetry'
import { logHomeEvent } from '@/features/home/log-home-event'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { useDismissedIds } from '@/features/insights/control-dismiss-store'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { HOME_TOUR, useRegisterTourScrollView } from '@/features/tours'
import { errorMessages } from '@/lib/copy/states'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

// Home-only dark canvas: a near-black with a whisper of brand green
// (never pure #000). User feedback: the forest-green dark background
// (theme.colors.background #12211A) plus the ambient aurora blobs read
// as "too green" and tired the eye. Scoped to Home for now via a
// Screen backgroundColor override; the global token is untouched so
// other screens keep the forest canvas. The muted-green surfaces
// (surfaceMuted #0F2E1F: cards, header buttons, payday chip) now float
// on this near-black, which makes them read as one calm family and
// lets the eye rest on the empty canvas between them.
const HOME_DARK_CANVAS = '#0A0F0C'

interface HomeScreenProps {
  userId: string
  familyId: string
}

export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const [salaryErrorMessage, setSalaryErrorMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Register the screen's ScrollView ref so the guided tour can
  // auto-scroll each step into view before highlighting it.
  const tourScrollRef = useRef<ScrollView | null>(null)
  const {
    onScroll: onTourScroll,
    onContentSizeChange: onTourContentSizeChange,
  } = useRegisterTourScrollView(HOME_TOUR, tourScrollRef)

  // AppStackShell already fires and seeds this; here we only need the
  // refetch handle for pull-to-refresh.
  const snapshot = useHomeSnapshot(userId)

  // Telemetry session: emits home.opened on mount, home.closed on
  // unmount, and home.left_without_tap when no element gets tapped.
  // Declared early so `handleRefresh` can correlate the refresh
  // event to the same sessionId children will use.
  const telemetry = useHomeTelemetry(familyId)

  // Detect scroll-to-bottom once per session so analytics can compute
  // scroll-depth proxy. The ref guard prevents repeat-firing on
  // bounce-back scrolls.
  const reachedBottomRef = useRef(false)
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Mirror the offset into the tour registry so its auto-scroll
      // can compute absolute targets without measureLayout.
      onTourScroll(event)
      if (reachedBottomRef.current) return
      if (!familyId) return
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      // 40pt buffer — pull-to-refresh and the bottom safe-area
      // trigger close-but-not-exact bottoms; 40pt is wide enough to
      // catch both without firing in mid-scroll.
      if (distanceFromBottom <= 40 && contentSize.height > layoutMeasurement.height) {
        reachedBottomRef.current = true
        void logHomeEvent({
          familyId,
          event: 'home.scrolled_to_bottom',
          context: { session_id: telemetry.sessionId },
        })
      }
    },
    [familyId, onTourScroll, telemetry.sessionId],
  )

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    if (familyId) {
      void logHomeEvent({
        familyId,
        event: 'home.refreshed',
        context: { session_id: telemetry.sessionId },
      })
    }
    // Re-arm scroll-to-bottom detection: content can reflow after a
    // refresh (new rows shrink/expand the height) and the user may
    // legitimately reach the bottom again. Without this reset we'd
    // undercount in dynamic-content sessions.
    reachedBottomRef.current = false
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot, familyId, telemetry.sessionId])

  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const isSolo = useIsSolo(userId)
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 6)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)
  // Numeric count drives the bell's count badge in the header. Re-renders
  // on every count delta — acceptable since the badge text is the count.
  const unreadNotificationsCountQuery = useUnreadNotificationsCount(familyId, userId)
  const unreadNotificationsCount = unreadNotificationsCountQuery.data ?? 0

  // Subscribe to live changes on expenses / fixed_expenses /
  // savings_goals / notifications so a family member's edits flow
  // into Home without the user having to pull-to-refresh.
  useHomeRealtime(familyId)

  // Assistant pending count — same source the Control card uses, so the
  // badge stays in sync with what the user will see when they open the
  // sheet. Filter dismissed in case some were swiped away from Control.
  //
  // `defer: true` · la badge no es decision-grade en la primera frame
  // (queda en 0 hasta que cargue, ~600ms después del mount). Defer evita
  // que el chain de queries pesado (controlIntelligence + summaries +
  // limits + velocity + notifications) compita por JS thread con la
  // navegación / first-paint del Home. Cuando Home tira prefetch en
  // tabs layout, esto se vuelve casi-instantáneo igual.
  const { signals: assistantSignals } = useControlV2Data(familyId, null, { defer: true })
  const assistantDismissed = useDismissedIds()
  const assistantPendingCount = assistantSignals.filter((t) => {
    const key = t.action?.kind === 'dismiss' ? t.action.dismissId : t.id
    return !assistantDismissed.has(key)
  }).length

  const categoryNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [category.id, category.name] as const),
      ),
    [categoriesQuery.data],
  )
  // Activity feed shows only variable gastos (manual entries). Rows
  // with `commitment_id` are auto-recorded payments of fixed
  // expenses — those live exclusively on the Fijos screen.
  const recentExpenses = useMemo(
    () => (recentExpensesQuery.data ?? []).filter((e) => !e.commitment_id),
    [recentExpensesQuery.data],
  )

  const shouldShowDashboardError =
    (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
    (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
    (dashboard.expensesQuery.error && !dashboard.expensesQuery.data)

  const activityError =
    recentExpensesQuery.isError && recentExpenses.length === 0
      ? recentExpensesQuery.error
      : categoriesQuery.isError && recentExpenses.length === 0
        ? categoriesQuery.error
        : undefined

  // Persists the cycle confirmation. `startingBalance: number` =
  // user's adjusted available cash for THIS cycle (engine override).
  // `startingBalance: null` = user kept the default monthly_income;
  // we still anchor the cycle so we don't re-prompt this period.
  const confirmCycleStartingBalance = useCallback((startingBalance: number | null) => {
    setSalaryErrorMessage(null)
    // `cycleAnchorTarget` lands on `payCycle.start` in steady state
    // and pivots to `currentMonthPayDate` while the salary freeze is
    // active — see family-dashboard-model. Using it ensures the
    // prompt clears as soon as the freeze releases post-confirm.
    const cycleAnchor = formatLocalDateKey(dashboard.cycleAnchorTarget)
    upsertFamilyFinanceMutation.mutate(
      buildCycleStartingBalanceInput(
        {
          dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
          dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
          dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
          dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
          monthlyIncome: dashboard.monthlyIncome,
          savingsGoal: dashboard.savingsGoal,
          savingsGoalPercent:
            dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
          usdExchangeRate: dashboard.usdExchangeRate,
          salaryPaymentDay: dashboard.salaryPaymentDay,
          lastSalaryConfirmedAt:
            dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
          currentCycleStartingBalance:
            dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
          currentCycleAnchor:
            dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
        },
        cycleAnchor,
        startingBalance,
      ),
      {
        onError: (error: unknown) => {
          setSalaryErrorMessage(getErrorMessage(error, errorMessages.server))
          void triggerHaptic('error')
        },
        onSuccess: () => {
          void triggerHaptic('success')
        },
      },
    )
  }, [
    dashboard.cycleAnchorTarget,
    dashboard.dailyBudgetBufferMode,
    dashboard.dailyBudgetBufferValue,
    dashboard.dailyBudgetCheckinHour,
    dashboard.dailyBudgetNudgesEnabled,
    dashboard.monthlyIncome,
    dashboard.savingsGoal,
    dashboard.familyFinanceQuery.data?.savings_goal_percent,
    dashboard.usdExchangeRate,
    dashboard.salaryPaymentDay,
    dashboard.familyFinanceQuery.data?.last_salary_confirmed_at,
    dashboard.familyFinanceQuery.data?.current_cycle_starting_balance,
    dashboard.familyFinanceQuery.data?.current_cycle_anchor,
    upsertFamilyFinanceMutation,
  ])

  const handleDeleteExpense = useCallback((expenseId: string) => {
    void triggerHaptic('warning')
    deleteExpenseMutation.mutate(expenseId, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        Alert.alert(
          'No pudimos eliminar',
          getErrorMessage(error, errorMessages.server),
        )
      },
      onSuccess: () => {
        void triggerHaptic('success')
      },
    })
  }, [deleteExpenseMutation])

  return (
    <Screen
      backgroundColor={theme.isDark ? HOME_DARK_CANVAS : undefined}
      contentContainerStyle={styles.screenContent}
      onScroll={handleScroll}
      // Tour math reads `scrollYRef.current` to compute each step's
      // window position; with a 250ms throttle the ref drifted up
      // to a quarter-second behind the actual scroll, which made the
      // highlight land off-target on Home (other screens use 64ms).
      // 16ms = once per frame at 60fps; the existing
      // `home.scrolled_to_bottom` telemetry inside `handleScroll`
      // is rate-limited by its own `reachedBottomRef`, so the higher
      // event rate is harmless there.
      scrollEventThrottle={16}
      scrollRef={tourScrollRef}
      onContentSizeChange={onTourContentSizeChange}
      // Rendered behind the ScrollView (not inside it) so the auroras
      // cover the full viewport and don't scroll with the content.
      backgroundSlot={
        // Light mode keeps the warm aurora ambience (backdrop + bright
        // blobs). Dark mode drops the backdrop and swaps the blobs to
        // the 'calm' tone: faint forest-green halos on the near-black
        // canvas. The original bright mint/peach aurora was the main
        // source of the "too green" fatigue; the calm halos add gentle
        // depth that echoes the card surface without the saturation.
        theme.isDark ? (
          <AmbientBlobs tone="calm" />
        ) : (
          <>
            <AmbientBackdrop variant="home" />
            <AmbientBlobs />
          </>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={brand.bright}
          colors={[brand.deep]}
        />
      }
    >
      {shouldShowDashboardError ? (
        <ErrorState
          description={getErrorMessage(
            dashboard.dashboardError,
            errorMessages.server,
          )}
          title="No pudimos abrir tu panorama"
          onAction={() => {
            void dashboard.refetchAll()
          }}
        />
      ) : !snapshot.data ? (
        // Esperar a que home_snapshot termine y popule (vía seedCaches)
        // los caches de los feature hooks ANTES de mountar el dashboard.
        // Sin este gate, los feature hooks (useExpenses, useFamilyFinance,
        // useFixedExpenses, useFamilyNotifications, etc.) montean en
        // paralelo con home_snapshot y disparan fetches redundantes —
        // la red dispara ~7 requests duplicados en cada cold start del
        // home aunque home_snapshot ya los tiene incluidos. Gateando en
        // snapshot.data (que solo está disponible tras seedCaches), los
        // feature hooks encuentran cache caliente al montearse y no
        // refetchean (con staleTime: 60_000 que igualan home_snapshot).
        // Trade-off: ~400ms de loading en cold start vs el flash actual
        // de "todo carga junto" — el loading queda silenciado por el
        // splash de auth-transition y la transición al home cierra
        // sin diferencia perceptible.
        null
      ) : (
        <HomeDashboard
          dashboard={dashboard}
          recentExpenses={recentExpenses}
          categoryNameById={categoryNameById}
          familyId={familyId}
          isSolo={isSolo}
          displayName={displayName}
          unreadNotificationsCount={unreadNotificationsCount}
          assistantPendingCount={assistantPendingCount}
          onPressNotifications={() => router.push('/(app)/notifications')}
          onPressSettings={() => router.push('/(app)/settings')}
          onPressAssistant={() => {
            void triggerHaptic('selection')
            router.push('/(app)/asistente')
          }}
          onPressConfigureIncome={() => {
            void triggerHaptic('selection')
            router.push('/(app)/settings')
          }}
          isLoadingActivity={recentExpensesQuery.isLoading}
          activityError={activityError}
          onConfirmCycleStartingBalance={confirmCycleStartingBalance}
          onDeleteExpense={handleDeleteExpense}
          telemetrySessionId={telemetry.sessionId}
          onMarkTapped={telemetry.markTapped}
          pendingDeleteExpenseId={
            deleteExpenseMutation.isPending
              ? (deleteExpenseMutation.variables ?? null)
              : null
          }
          isSavingSalary={upsertFamilyFinanceMutation.isPending}
          salaryErrorMessage={salaryErrorMessage}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    // Match the Ajustes top offset (safe area + 14pt). Screens without
    // Screen's own title no longer render an empty ScreenHeader, so
    // we apply the offset directly.
    paddingTop: 14,
  },
})
