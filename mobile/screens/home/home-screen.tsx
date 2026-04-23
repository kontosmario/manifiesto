import { useCallback, useMemo, useState } from 'react'
import { Alert, RefreshControl, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { HomeDashboard } from '@/components/home/home-dashboard'
import { brand } from '@/theme/palette'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { Screen } from '@/components/ui/screen'
import { useCategories } from '@/features/categories/use-categories'
import { useDeleteExpense, useRecentExpenses } from '@/features/expenses/use-expenses'
import {
  buildSalaryConfirmationInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamily } from '@/features/family/use-family'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { errorMessages } from '@/lib/copy/states'
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
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

  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const { data: familyInfo } = useFamily(userId)
  const familyName = familyInfo?.familyCode ? `Familia ${familyInfo.familyCode}` : 'Tu familia'
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 3)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)

  const categoryNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [category.id, category.name] as const),
      ),
    [categoriesQuery.data],
  )
  const recentExpenses = recentExpensesQuery.data ?? []
  const headerPalette = buildScreenHeaderPalette(theme)

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

  const confirmSalary = () => {
    setSalaryErrorMessage(null)
    upsertFamilyFinanceMutation.mutate(
      buildSalaryConfirmationInput({
        dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
        dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
        dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
        dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
        essentialMonthlyCost:
          dashboard.familyFinanceQuery.data?.essential_monthly_cost ?? 0,
        monthlyIncome: dashboard.monthlyIncome,
        savingsGoal: dashboard.savingsGoal,
        savingsGoalPercent:
          dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
        usdExchangeRate: dashboard.usdExchangeRate,
        salaryPaymentDay: dashboard.salaryPaymentDay,
        lastSalaryConfirmedAt:
          dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      }),
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([dashboard.refetchAll(), recentExpensesQuery.refetch()])
    } finally {
      setIsRefreshing(false)
    }
  }, [dashboard, recentExpensesQuery])

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
      rightSlot={
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="Ir a notificaciones"
            icon="notifications-none"
            backgroundColor={headerPalette.buttonBackgroundColor}
            badgeColor={theme.colors.danger}
            borderColor={headerPalette.buttonBorderColor}
            iconColor={headerPalette.iconColor}
            showBadge
            symbolName="bell"
            onPress={() => router.push('/(app)/notifications')}
          />
          <IconButton
            accessibilityLabel="Ir a ajustes"
            icon="tune"
            backgroundColor={headerPalette.buttonBackgroundColor}
            borderColor={headerPalette.buttonBorderColor}
            iconColor={headerPalette.iconColor}
            symbolName="slider.horizontal.3"
            onPress={() => router.push('/(app)/settings')}
          />
        </View>
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
          familyName={familyName}
          isLoadingActivity={recentExpensesQuery.isLoading}
          activityError={activityError}
          onConfirmSalary={confirmSalary}
          onDeleteExpense={handleDeleteExpense}
          isSavingSalary={upsertFamilyFinanceMutation.isPending}
          salaryErrorMessage={salaryErrorMessage}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
