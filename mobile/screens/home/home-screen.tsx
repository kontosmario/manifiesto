import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { HomeMetricStrip } from '@/components/home/home-metric-strip'
import { PaydayChip } from '@/components/home/payday-chip'
import { Screen } from '@/components/ui/screen'
import { useCategories } from '@/features/categories/use-categories'
import { useRecentExpenses } from '@/features/expenses/use-expenses'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import {
  buildHomeMetrics,
  classifyDashboardError,
  daysUntilPayday,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { triggerHaptic } from '@/lib/haptics'

interface HomeScreenProps {
  userId: string
  familyId: string
}

// BISECT ROUND 2: HomeDashboard without ConfirmSalarySheet to isolate the
// BottomSheetModal as the potential native crash source.
export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const router = useRouter()
  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 3)

  const categoryNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [category.id, category.name] as const),
      ),
    [categoriesQuery.data],
  )
  const recentExpenses = recentExpensesQuery.data ?? []

  const today = useMemo(() => new Date(), [])
  const paymentDay = dashboard.familyFinanceQuery.data?.salary_payment_day ?? null
  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const pending = useMemo(
    () => isPaydayPending({ paymentDay, lastConfirmedAt }, today),
    [paymentDay, lastConfirmedAt, today],
  )
  const days = useMemo(() => daysUntilPayday({ paymentDay }, today), [paymentDay, today])
  const metrics = useMemo(() => buildHomeMetrics(dashboard), [dashboard])
  const activityError =
    recentExpensesQuery.isError && recentExpenses.length === 0
      ? recentExpensesQuery.error
      : categoriesQuery.isError && recentExpenses.length === 0
        ? categoriesQuery.error
        : undefined
  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }
  const handleViewAll = () => router.push('/(app)/(tabs)/expenses')
  const handleConfirmStub = () => {
    void triggerHaptic('light')
  }
  const handleDeleteStub = (_id: string) => {
    void triggerHaptic('warning')
  }

  return (
    <Screen title={`Hola, ${displayName}`} contentContainerStyle={styles.content}>
      <View style={styles.stack}>
        <PaydayChip daysUntilPayday={days} isPending={pending} onPressConfirm={handleConfirmStub} />
        <HomeHeroCard
          availableToday={metrics.availableToday}
          projectedMargin={metrics.projectedMargin}
          onPressAddExpense={handleAddExpense}
        />
        <HomeMetricStrip savedAmount={metrics.savedAmount} fixedAmount={metrics.fixedAmount} />
        <HomeActivitySection
          expenses={recentExpenses}
          categoryNameById={categoryNameById}
          isLoading={recentExpensesQuery.isLoading}
          errorKind={activityErrorKind}
          onDelete={handleDeleteStub}
          onRetry={() => {
            void dashboard.refetchAll()
          }}
          onViewAll={handleViewAll}
          onAddFirst={handleAddExpense}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  stack: { gap: 24 },
})
