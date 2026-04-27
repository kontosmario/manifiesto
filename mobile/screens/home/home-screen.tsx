import { useCallback, useMemo, useState } from 'react'
import { Alert, RefreshControl, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { HomeDashboard } from '@/components/home/home-dashboard'
import { brand } from '@/theme/palette'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useCategories } from '@/features/categories/use-categories'
import { useDeleteExpense, useRecentExpenses } from '@/features/expenses/use-expenses'
import {
  buildCycleStartingBalanceInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useMyProfile } from '@/features/profile/use-profile'
import { useUnreadNotificationsCount } from '@/features/notifications/use-notifications'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { errorMessages } from '@/lib/copy/states'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface HomeScreenProps {
  userId: string
  familyId: string
}

export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const [salaryErrorMessage, setSalaryErrorMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // AppStackShell already fires and seeds this; here we only need the
  // refetch handle for pull-to-refresh.
  const snapshot = useHomeSnapshot(userId)

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot])

  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 6)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)
  const unreadNotificationsQuery = useUnreadNotificationsCount(familyId, userId)
  const unreadNotificationCount = unreadNotificationsQuery.data ?? 0

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
  const confirmCycleStartingBalance = (startingBalance: number | null) => {
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
  }

  const handleDeleteExpense = (expenseId: string) => {
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
  }

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={brand.bright}
          colors={[brand.deep]}
        />
      }
    >
      {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}

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
      ) : (
        <HomeDashboard
          dashboard={dashboard}
          recentExpenses={recentExpenses}
          categoryNameById={categoryNameById}
          familyId={familyId}
          displayName={displayName}
          hasUnreadNotifications={unreadNotificationCount > 0}
          onPressNotifications={() => router.push('/(app)/notifications')}
          onPressSettings={() => router.push('/(app)/settings')}
          isLoadingActivity={recentExpensesQuery.isLoading}
          activityError={activityError}
          onConfirmCycleStartingBalance={confirmCycleStartingBalance}
          onDeleteExpense={handleDeleteExpense}
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
