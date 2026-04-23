import { useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { ConfirmSalarySheet } from '@/components/home/confirm-salary-sheet'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  buildHomeMetrics,
  buildHomeVelocity,
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'

interface HomeDashboardProps {
  dashboard: FamilyDashboard
  recentExpenses: Expense[]
  categoryNameById: Map<string, string>
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
  isLoadingActivity,
  activityError,
  onConfirmSalary,
  onDeleteExpense,
  isSavingSalary,
  salaryErrorMessage,
}: HomeDashboardProps) {
  const router = useRouter()
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
  const velocity = useMemo(
    () =>
      buildHomeVelocity({
        spentInCurrentCycle: dashboard.spentInCurrentCycle ?? 0,
        totalAvailable: metrics.availableToday,
        cycle,
        todayDate: today,
      }),
    [cycle, dashboard.spentInCurrentCycle, metrics.availableToday, today],
  )
  const burnHint = useMemo(() => {
    if (!velocity || velocity.runwayDays == null || velocity.runwayDate == null) return null
    const burn = Math.round(velocity.burnRatePerDay)
    const formatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
    const dateFormatter = new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    return `Ritmo −$${formatter.format(burn)}/día · alcanza hasta ${dateFormatter.format(velocity.runwayDate)}`
  }, [velocity])

  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  const handleChipConfirm = () => {
    sheetRef.current?.present()
  }

  const handleSheetConfirm = () => {
    onConfirmSalary()
  }

  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }

  const handleViewAll = () => {
    router.push('/(app)/(tabs)/expenses')
  }

  return (
    <View style={styles.stack}>
      <View>
        <HomeHeroCard
          availableToday={metrics.availableToday}
          projectedMargin={metrics.projectedMargin}
          savedAmount={metrics.savedAmount}
          fixedAmount={metrics.fixedAmount}
          cycleProgress={cycle?.progress ?? null}
          cycleDaysElapsed={cycle?.daysElapsed ?? null}
          cycleTotalDays={cycle?.totalDays ?? null}
          daysUntilPayday={days}
          isPaydayPending={pending}
          onPressPaydayConfirm={handleChipConfirm}
          burnHint={burnHint}
        />
      </View>

      <HomeActivitySection
        expenses={recentExpenses}
        categoryNameById={categoryNameById}
        isLoading={isLoadingActivity}
        errorKind={activityErrorKind}
        onDelete={onDeleteExpense}
        onRetry={() => {
          void dashboard.refetchAll()
        }}
        onViewAll={handleViewAll}
        onAddFirst={handleAddExpense}
      />

      <ConfirmSalarySheet
        ref={sheetRef}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onConfirm={handleSheetConfirm}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 24,
  },
})
