// mobile/components/home/home-dashboard.tsx
import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { ConfirmSalarySheet } from '@/components/home/confirm-salary-sheet'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCardV2 } from '@/components/home/home-hero-card-v2'
import { GreetingHeader } from '@/components/home/greeting-header'
import { FamilyStrip } from '@/components/home/family-strip'
import { ShortcutCardsRow } from '@/components/home/shortcut-cards-row'
import { MetaCard } from '@/components/home/meta-card'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  buildHomeMetrics,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { buildHeroStatsTrio } from '@/features/home/home-aggregates.model'
import { useMonthlyExpenseComparison } from '@/features/home/use-monthly-expense-comparison'
import { useDailyAvailableSparkline } from '@/features/home/use-daily-available-sparkline'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  categoryNameById: Map<string, string>
  familyId: string
  displayName: string
  familyName: string
  isLoadingActivity: boolean
  activityError: unknown
  onConfirmSalary: () => void
  onDeleteExpense: (expenseId: string) => void
  isSavingSalary: boolean
  salaryErrorMessage: string | null
}

export function HomeDashboard({
  dashboard,
  recentExpenses,
  categoryNameById,
  familyId,
  displayName,
  familyName,
  isLoadingActivity,
  activityError,
  onConfirmSalary,
  onDeleteExpense,
  isSavingSalary,
  salaryErrorMessage,
}: HomeDashboardProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const sheetRef = useRef<BottomSheetHandle>(null)
  const [today] = useState(() => new Date())

  const paymentDay = dashboard.familyFinanceQuery.data?.salary_payment_day ?? null
  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const pending = useMemo(
    () => isPaydayPending({ paymentDay, lastConfirmedAt }, today),
    [paymentDay, lastConfirmedAt, today],
  )
  const days = useMemo(() => daysUntilPayday({ paymentDay }, today), [paymentDay, today])
  const cycle = useMemo(() => getPaydayCycle({ paymentDay }, today), [paymentDay, today])
  const metrics = useMemo(() => buildHomeMetrics(dashboard), [dashboard])

  const dailyBudget =
    cycle && cycle.totalDays > 0
      ? Math.max(0, Math.round(metrics.availableToday / (cycle.daysRemaining || 1)))
      : null

  const cycleStart = cycle?.lastPayday ?? null
  const sparklineQuery = useDailyAvailableSparkline({
    familyId,
    cycleStart,
    totalAvailable: metrics.availableToday + (dashboard.spentInCurrentCycle ?? 0),
    today,
  })
  const comparisonQuery = useMonthlyExpenseComparison(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  const membersQuery = useFamilyMembers(familyId)

  const fixedExpenses = dashboard.fixedExpensesQuery.data ?? []
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds: fixedExpenses.map((fe) => fe.id),
    today,
  })

  const heroStats = useMemo(
    () =>
      buildHeroStatsTrio({
        dailyBudget,
        totalAvailable: metrics.availableToday,
        daysElapsed: cycle?.daysElapsed ?? 0,
        expenses: recentExpenses.map((e) => ({ price: e.price, created_at: e.created_at })),
        today,
      }),
    [dailyBudget, metrics.availableToday, cycle?.daysElapsed, recentExpenses, today],
  )

  const cycleDayLabel = useMemo(() => {
    if (!cycle) return null
    const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(
      today,
    )
    return `${monthName[0].toUpperCase()}${monthName.slice(1)} · día ${cycle.daysElapsed}/${cycle.totalDays}`
  }, [cycle, today])

  const miniBars = useMemo(
    () => buildMiniBarsForGastos(recentExpenses, today),
    [recentExpenses, today],
  )

  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  const handleChipConfirm = () => sheetRef.current?.present()
  const handleSheetConfirm = () => onConfirmSalary()
  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }
  const handleViewGastos = () => router.push('/(app)/(tabs)/expenses')
  const handleViewFijos = () => router.push('/(app)/(tabs)/fixed-expenses')
  const handleViewMeta = () => router.push('/(app)/savings-goal')

  return (
    <View style={styles.stack}>
      <AmbientBlobs />
      <GreetingHeader name={displayName} />
      <FamilyStrip
        members={membersQuery.data ?? []}
        familyName={familyName}
        daysUntilPayday={days}
        paydayPending={pending}
        onPaydayPress={handleChipConfirm}
      />
      <HomeHeroCardV2
        availableToday={metrics.availableToday}
        projectedMargin={metrics.projectedMargin}
        monthlyComparison={comparisonQuery.data ?? null}
        sparkline={sparklineQuery.data ?? null}
        heroStats={heroStats}
        cycleDayLabel={cycleDayLabel}
      />
      <ShortcutCardsRow
        gastos={{
          total: comparisonQuery.data?.currentMonthTotal ?? 0,
          count: (dashboard.expensesQuery.data ?? []).length,
          trendLabel:
            comparisonQuery.data && comparisonQuery.data.deltaPercent != null
              ? `${comparisonQuery.data.deltaPercent > 0 ? '+' : ''}${Math.round(comparisonQuery.data.deltaPercent)}% vs ${comparisonQuery.data.previousMonthLabel}`
              : null,
          trendDirection: comparisonQuery.data?.direction ?? null,
          miniBars,
        }}
        fijos={{
          monthlyTotal: metrics.fixedAmount,
          paidCount: paymentsQuery.data?.length ?? 0,
          totalCount: fixedExpenses.length,
          upcomingCount: countUpcoming(fixedExpenses, today),
        }}
        onPressGastos={handleViewGastos}
        onPressFijos={handleViewFijos}
      />
      {savingsGoalQuery.data ? (
        <MetaCard goal={savingsGoalQuery.data} onPress={handleViewMeta} />
      ) : null}

      <View style={styles.activityHeader}>
        <Text style={[styles.activityLabel, { color: theme.colors.textMuted }]}>ACTIVIDAD</Text>
        <Text style={[styles.activityLink, { color: theme.colors.text }]}>Ver todos</Text>
      </View>
      <HomeActivitySection
        expenses={recentExpenses}
        categoryNameById={categoryNameById}
        familyMembers={membersQuery.data ?? []}
        isLoading={isLoadingActivity}
        errorKind={activityErrorKind}
        onDelete={onDeleteExpense}
        onRetry={() => {
          void dashboard.refetchAll()
        }}
        onViewAll={handleViewGastos}
        onAddFirst={handleAddExpense}
      />

      <View style={styles.bottomSpacer} />

      <ConfirmSalarySheet
        ref={sheetRef}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onConfirm={handleSheetConfirm}
      />
    </View>
  )
}

function buildMiniBarsForGastos(expenses: Expense[], today: Date): number[] {
  const byDay = new Map<number, number>()
  for (const e of expenses) {
    const d = new Date(e.created_at)
    const daysAgo = Math.floor((today.getTime() - d.getTime()) / 86_400_000)
    if (daysAgo < 0 || daysAgo > 6) continue
    byDay.set(6 - daysAgo, (byDay.get(6 - daysAgo) ?? 0) + e.price)
  }
  const arr = Array.from({ length: 7 }, (_, i) => byDay.get(i) ?? 0)
  const max = Math.max(1, ...arr)
  return arr.map((v) => v / max)
}

function countUpcoming(
  fixedExpenses: { next_due_on?: string | null }[],
  today: Date,
): number {
  const sevenDays = 7 * 86_400_000
  return fixedExpenses.filter((fe) => {
    if (!fe.next_due_on) return false
    const dueMs = new Date(fe.next_due_on).getTime() - today.getTime()
    return dueMs >= 0 && dueMs <= sevenDays
  }).length
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  activityLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  activityLink: { fontSize: 13, fontWeight: '600' },
  bottomSpacer: { height: 120 },
})
