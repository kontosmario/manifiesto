import { useState } from 'react'
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native'
import {
  ControlHeroCard,
  ControlMonthsSection,
  ControlPlanSection,
  ControlTodaySection,
} from '@/components/home/control-sections'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Screen } from '@/components/ui/screen'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useClearFamilyExpenses } from '@/features/expenses/use-expenses'
import {
  buildSalaryConfirmationInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { CONTROL_SECTIONS, type ControlSection } from '@/features/insights/control-model'
import { useControlSnapshot } from '@/features/insights/use-control-snapshot'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface InsightsScreenProps {
  familyId: string
  canGoBack?: boolean
}

export function InsightsScreen({ familyId, canGoBack = false }: InsightsScreenProps) {
  const { theme } = useAppTheme()
  const { width } = useWindowDimensions()
  const isCompactWidth = width < 410
  const {
    commitmentSummary,
    controlMood,
    cyclePlanActions,
    cyclePressure,
    dailyBudgetSummary,
    dashboard,
    expenseAnalytics,
    expensesQuery,
    focusMetrics,
    hasDailyBudgetBase,
    heroMetrics,
    heroState,
    history,
    isIntelligenceLoading,
    isOverviewLoading,
    projectedCloseValue,
    todayActions,
    todayMetrics,
  } = useControlSnapshot(familyId)
  const clearFamilyExpensesMutation = useClearFamilyExpenses(familyId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)
  const [activeSection, setActiveSection] = useState<ControlSection>('today')

  const handleError = (error: unknown, fallbackMessage: string) => {
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
        salaryPaymentDay: dashboard.salaryPaymentDay,
        usdExchangeRate: dashboard.usdExchangeRate,
        lastSalaryConfirmedAt: dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      }),
      {
        onError: (error: unknown) => {
          handleError(error, 'No se pudo confirmar el cobro.')
        },
      },
    )
  }

  return (
    <Screen
      canGoBack={canGoBack}
      contentContainerStyle={styles.screenContent}
      subtitle="Qué hacer hoy, cómo viene el ciclo y dónde se está escapando plata."
      title="Control"
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="control" /> : null}

        <ControlHeroCard
          controlMood={controlMood}
          heroMetrics={heroMetrics}
          heroState={heroState}
          isCompactWidth={isCompactWidth}
          isLoading={isOverviewLoading}
          isSalaryPendingConfirmation={dashboard.isSalaryPendingConfirmation}
          isSubmittingSalaryConfirmation={upsertFamilyFinanceMutation.isPending}
          onConfirmSalary={confirmSalary}
        />

        <BrandedPanel style={styles.segmentedShell}>
          <SegmentedControl
            options={CONTROL_SECTIONS.map((section) => ({
              label: section.label,
              value: section.value,
            }))}
            onChange={setActiveSection}
            value={activeSection}
          />
        </BrandedPanel>

        {activeSection === 'today'
          ? (
              <ControlTodaySection
                commitmentSummary={commitmentSummary}
                dailyBudgetSummary={dailyBudgetSummary}
                expensesAreLoading={expensesQuery.isLoading}
                financeIsLoading={dashboard.familyFinanceQuery.isLoading}
                hasDailyBudgetBase={hasDailyBudgetBase}
                isCompactWidth={isCompactWidth}
                todayActions={todayActions}
                todayMetrics={todayMetrics}
              />
            )
          : activeSection === 'plan'
            ? (
                <ControlPlanSection
                  cyclePlanActions={cyclePlanActions}
                  expenseAnalytics={expenseAnalytics}
                  focusMetrics={focusMetrics}
                  isCompactWidth={isCompactWidth}
                  isLoading={isIntelligenceLoading}
                />
              )
            : (
                <ControlMonthsSection
                  clearHistoryIsPending={clearFamilyExpensesMutation.isPending}
                  cyclePressure={cyclePressure}
                  expenseAnalytics={expenseAnalytics}
                  history={history.map((row) => ({
                    balance: row.endBalance,
                    label: row.monthLabel.slice(0, 3),
                    spent: row.spent,
                  }))}
                  isCompactWidth={isCompactWidth}
                  monthlyHistory={dashboard.monthlyHistory}
                  monthlyHistoryIsLoading={dashboard.monthlyHistoryIsLoading}
                  monthlyHistoryTotals={dashboard.monthlyHistoryTotals}
                  monthlyIncome={dashboard.monthlyIncome}
                  onClearHistory={() => {
                    clearFamilyExpensesMutation.mutate(undefined, {
                      onError: (error: unknown) => {
                        handleError(error, 'No se pudo limpiar la data de gastos.')
                      },
                    })
                  }}
                  projectedCloseValue={projectedCloseValue}
                  savingsGoal={dashboard.savingsGoal}
                  savingsRemaining={dashboard.savingsRemaining}
                />
              )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
    position: 'relative',
  },
  segmentedShell: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
})
