// mobile/components/home/home-dashboard.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AlertsStrip } from '@/components/home/alerts-strip'
import {
  OnboardingAvailableSheet,
  SalaryConfirmationSheet,
} from '@/components/home/cycle-balance-prompt-sheet'
import { MetaCard } from '@/components/home/meta-card'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { HomeActivitySection } from '@/components/home/home-activity-section'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { HomeHeader } from '@/components/home/home-header'
import { FamilyStrip } from '@/components/home/family-strip'
import { MonthSummaryCard } from '@/components/home/month-summary-card'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  classifyDashboardError,
  daysUntilPayday,
  getPaydayCycle,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import { useHomeMetrics, type HomeAlert } from '@/features/home/use-home-metrics'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
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
  hasUnreadNotifications?: boolean
  onPressNotifications?: () => void
  onPressSettings?: () => void
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
}

export function HomeDashboard({
  dashboard,
  recentExpenses,
  categoryNameById,
  familyId,
  displayName,
  hasUnreadNotifications = false,
  onPressNotifications,
  onPressSettings,
  isLoadingActivity,
  activityError,
  onConfirmCycleStartingBalance,
  onDeleteExpense,
  pendingDeleteExpenseId,
  isSavingSalary,
  salaryErrorMessage,
}: HomeDashboardProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const [today] = useState(() => new Date())
  const [isCycleBalanceSheetOpen, setCycleBalanceSheetOpen] = useState(false)

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
  const hasManualExpense = (dashboard.expensesQuery.data ?? []).some(
    (e) => !e.commitment_id,
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

  const handleChipConfirm = () => {
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
  }
  const handleCycleSheetClose = () => {
    if (isSavingSalary) return
    setCycleBalanceSheetOpen(false)
  }
  const handleCycleSheetSave = (amount: number) => {
    onConfirmCycleStartingBalance(amount)
    setCycleBalanceSheetOpen(false)
  }
  const handleCycleSheetKeepDefault = () => {
    onConfirmCycleStartingBalance(null)
    setCycleBalanceSheetOpen(false)
  }
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
  const handleAddExpense = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }
  const handleViewGastos = () => router.push('/(app)/(tabs)/expenses')
  const handleViewFijos = () => router.push('/(app)/(tabs)/fixed-expenses')
  const handleAlertPress = (alert: HomeAlert) => {
    // Every alert routes to the Fijos screen today; deep-linking a
    // particular fijo id will come when we add the detail route.
    void alert.actionRoute
    handleViewFijos()
  }

  return (
    <View style={styles.stack}>
      <AmbientBlobs />
      <HomeHeader
        name={displayName}
        hasUnreadNotifications={hasUnreadNotifications}
        onPressNotifications={onPressNotifications}
        onPressSettings={onPressSettings}
      />
      <FamilyStrip
        members={membersQuery.data ?? []}
        daysUntilPayday={days}
        paydayPending={pending}
        onPaydayPress={handleChipConfirm}
      />
      <HomeHeroCard data={homeMetrics.hero} />
      <AlertsStrip alerts={homeMetrics.alerts} onPressAlert={handleAlertPress} />
      <MonthSummaryCard
        data={homeMetrics.monthSummary}
        onPressVariable={handleViewGastos}
        onPressFixed={handleViewFijos}
      />
      {savingsGoalQuery.data ? (
        <MetaCard
          goal={savingsGoalQuery.data}
          enableQuickAdd
          suggestedAmount={cycleVault}
        />
      ) : null}

      <View style={styles.activityHeader}>
        <Text style={[styles.activityLabel, { color: theme.colors.textMuted }]}>ACTIVIDAD</Text>
        {recentExpenses.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todo el historial"
            hitSlop={10}
            onPress={handleViewGastos}
          >
            <Text style={[styles.activityLink, { color: theme.colors.primaryStrong }]}>
              Ver todos
            </Text>
          </Pressable>
        ) : null}
      </View>
      <HomeActivitySection
        expenses={recentExpenses}
        categoryNameById={categoryNameById}
        familyMembers={membersQuery.data ?? []}
        isLoading={isLoadingActivity}
        errorKind={activityErrorKind}
        onDelete={onDeleteExpense}
        pendingExpenseId={pendingDeleteExpenseId ?? null}
        onRetry={() => {
          void dashboard.refetchAll()
        }}
        onAddFirst={handleAddExpense}
      />

      <View style={styles.bottomSpacer} />

      {isOnboardingFlow ? (
        <OnboardingAvailableSheet
          visible={isCycleBalanceSheetOpen}
          monthlyIncome={dashboard.monthlyIncome}
          remainingDaysInCycle={remainingDaysInCycle}
          isSaving={isSavingSalary}
          errorMessage={salaryErrorMessage}
          onClose={handleCycleSheetClose}
          onSaveBalance={handleCycleSheetSave}
          onKeepDefault={handleCycleSheetKeepDefault}
        />
      ) : (
        <SalaryConfirmationSheet
          visible={isCycleBalanceSheetOpen}
          monthlyIncome={dashboard.monthlyIncome}
          remainingDaysInCycle={remainingDaysInCycle}
          isSaving={isSavingSalary}
          errorMessage={salaryErrorMessage}
          onClose={handleCycleSheetClose}
          onSaveBalance={handleCycleSheetSave}
          onKeepDefault={handleCycleSheetKeepDefault}
        />
      )}
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
