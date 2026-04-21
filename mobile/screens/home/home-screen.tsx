import { useMemo } from 'react'
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { IconButton } from '@/components/ui/icon-button'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { HomeActivityCard } from '@/components/home/home-activity-card'
import { HomeOverviewCard } from '@/components/home/home-overview-card'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { useCategories } from '@/features/categories/use-categories'
import { useRecentExpenses } from '@/features/expenses/use-expenses'
import {
  buildSalaryConfirmationInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
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
  const { width } = useWindowDimensions()
  const isCompactWidth = width < 410
  const balanceFontSize = width < 360 ? 30 : width < 410 ? 34 : 38
  const balanceLineHeight = balanceFontSize + 4
  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 3)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)

  const categoryNameById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category.name] as const)),
    [categoriesQuery.data],
  )
  const recentExpenses = recentExpensesQuery.data ?? []
  const headerPalette = buildScreenHeaderPalette(theme)
  const shouldShowDashboardError =
    (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
    (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
    (dashboard.expensesQuery.error && !dashboard.expensesQuery.data)
  const activityErrorMessage =
    recentExpensesQuery.isError && recentExpenses.length === 0
      ? getErrorMessage(
          recentExpensesQuery.error,
          'No pudimos cargar los últimos movimientos del hogar.',
        )
      : categoriesQuery.isError && recentExpenses.length === 0
        ? getErrorMessage(
            categoriesQuery.error,
            'No pudimos resolver las categorías para mostrar la actividad.',
          )
        : undefined

  const showError = (error: unknown, fallbackMessage: string) => {
    Alert.alert('Algo salió mal', getErrorMessage(error, fallbackMessage))
  }

  const confirmSalary = () => {
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
        lastSalaryConfirmedAt: dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      }),
      {
        onError: (error: unknown) => {
          showError(error, 'No se pudo confirmar el cobro.')
        },
      },
    )
  }

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
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
      titleColor={headerPalette.titleColor}
      title={`Hola, ${displayName}`}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? (
          <AmbientBackdrop variant="home" />
        ) : null}
        {shouldShowDashboardError ? (
          <ErrorState
            description={getErrorMessage(
              dashboard.dashboardError,
              'No pudimos cargar el resumen principal del hogar.',
            )}
            title="No pudimos abrir tu panorama"
            onAction={() => {
              void dashboard.refetchAll()
            }}
          />
        ) : (
          <HomeOverviewCard
            balanceFontSize={balanceFontSize}
            balanceLineHeight={balanceLineHeight}
            dashboard={dashboard}
            isCompactWidth={isCompactWidth}
            isSaving={upsertFamilyFinanceMutation.isPending}
            onConfirmSalary={confirmSalary}
          />
        )}

        <HomeActivityCard
          categoryNameById={categoryNameById}
          errorMessage={activityErrorMessage}
          isLoading={recentExpensesQuery.isLoading}
          onRetry={() => {
            void Promise.all([recentExpensesQuery.refetch(), categoriesQuery.refetch()])
          }}
          recentExpenses={recentExpenses}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 8,
  },
  sectionStack: {
    gap: 22,
    position: 'relative',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
