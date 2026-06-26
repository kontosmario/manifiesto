import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  HouseholdSetupProgressCard,
  HouseholdSavingsPresetCard,
  HouseholdSavingsResearchPanel,
} from '@/components/settings/household-setup-sections'
import { HeroStat, SettingsSwitchRow } from '@/components/settings/settings-primitives'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { SectionHeader } from '@/components/ui/section-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { NumpadField } from '@/components/ui/numpad-field'
import { formatPriceInputValue } from '@/utils/money'
import {
  type FamilyFinance,
  type FamilyFinanceInputSnapshot,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  deriveSavingsGoalAmount,
  TARGET_ESSENTIALS_PERCENT,
} from '@/features/finance/family-finance.model'
import {
  applyHouseholdSavingsPreset,
  buildHouseholdSavingsPresets,
  buildHouseholdSetupDraftState,
  buildHouseholdSetupFieldValues,
  buildHouseholdSetupSubmitState,
  buildHouseholdSavingsResearchNote,
  buildHouseholdSavingsResearchStats,
  parseHouseholdSetupMoneyInput,
  resolveEmergencyFundTarget,
  resolveFlexibleTargetPercent,
} from '@/features/settings/household-setup-wizard.model'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'
import { typography } from '@/theme/typography'

interface HouseholdSetupScreenProps {
  familyId: string
}

interface HouseholdSetupWizardContentProps extends HouseholdSetupScreenProps {
  initialSnapshot: FamilyFinanceInputSnapshot
  isInitialFlow: boolean
}

const TOTAL_STEPS = 3
const CURRENCY_FORMATTER = new Intl.NumberFormat('es-AR', {
  currency: 'ARS',
  style: 'currency',
})

function buildFamilyFinanceSnapshot(finance: FamilyFinance): FamilyFinanceInputSnapshot {
  return {
    dailyBudgetBufferMode: finance.daily_budget_buffer_mode,
    dailyBudgetBufferValue: finance.daily_budget_buffer_value,
    dailyBudgetCheckinHour: finance.daily_budget_checkin_hour,
    dailyBudgetNudgesEnabled: finance.daily_budget_nudges_enabled,
    lastSalaryConfirmedAt: finance.last_salary_confirmed_at,
    monthlyIncome: finance.monthly_income,
    salaryPaymentDay: finance.salary_payment_day,
    savingsGoal: finance.savings_goal,
    savingsGoalPercent: finance.savings_goal_percent,
    usdExchangeRate: finance.usd_exchange_rate,
    currentCycleStartingBalance: finance.current_cycle_starting_balance,
    currentCycleAnchor: finance.current_cycle_anchor,
    cycleType: 'monthly',
    cycleAnchorDate: null,
    cycleLengthDays: null,
  }
}

export function HouseholdSetupScreen({ familyId }: HouseholdSetupScreenProps) {
  const { t } = useTranslation()
  const { initial } = useLocalSearchParams<{ initial?: string }>()
  const isInitialFlow = initial === '1'
  const financeQuery = useFamilyFinance(familyId)
  const financeSnapshot = financeQuery.data
    ? buildFamilyFinanceSnapshot(financeQuery.data)
    : null
  const financeSeedKey = financeSnapshot ? JSON.stringify(financeSnapshot) : 'empty'

  if (financeQuery.isLoading && !financeSnapshot) {
    return (
      <Screen canGoBack={!isInitialFlow} title={t('settings:householdSetup.screenTitle')}>
        <LoadingBlock label={t('settings:householdSetup.loading')} />
      </Screen>
    )
  }

  if (!financeSnapshot) {
    return (
      <Screen canGoBack={!isInitialFlow} title={t('settings:householdSetup.screenTitle')}>
        <ErrorState
          description={t('settings:householdSetup.errorDescription')}
          title={t('settings:householdSetup.errorTitle')}
          onAction={() => {
            void financeQuery.refetch()
          }}
        />
      </Screen>
    )
  }

  return (
    <HouseholdSetupWizardContent
      familyId={familyId}
      initialSnapshot={financeSnapshot}
      isInitialFlow={isInitialFlow}
      key={financeSeedKey}
    />
  )
}

function HouseholdSetupWizardContent({
  familyId,
  initialSnapshot,
  isInitialFlow,
}: HouseholdSetupWizardContentProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  // userId hace falta para que `useUpsertFamilyFinance` pueda invalidar
  // home_snapshot (root key) tras el upsert. Sin esto, los users veían
  // valores stale en el hero hasta el próximo refetch manual. Code
  // review screens-B3.
  const sessionUserId = useAuthSession().data?.user?.id
  const upsertFinanceMutation = useUpsertFamilyFinance(familyId, sessionUserId)
  const [currentStep, setCurrentStep] = useState(0)
  const [drafts, setDrafts] = useState(() => buildHouseholdSetupDraftState(initialSnapshot))

  // Field values still come from the wizard model for the summary card
  // in step 2 (it shows formatted snapshot copies of each field). The
  // inputs themselves now use NumpadField with raw drafts + their own
  // format functions, so we pass `false` for all focused flags.
  const fieldValues = buildHouseholdSetupFieldValues({
    bufferFocused: false,
    drafts,
    incomeFocused: false,
    savingsFocused: false,
    usdRateFocused: false,
  })
  const monthlyIncome = parseHouseholdSetupMoneyInput(drafts.incomeDraft)
  const savingsTargetPercent = Number(drafts.savingsDraft)
  const flexibleTargetPercent = resolveFlexibleTargetPercent(savingsTargetPercent)
  const monthlySavingsGoal = deriveSavingsGoalAmount(monthlyIncome, savingsTargetPercent)
  const benchmarkFund = resolveEmergencyFundTarget({
    monthlyIncome,
  })
  const formattedBenchmarkFund =
    benchmarkFund > 0 ? CURRENCY_FORMATTER.format(benchmarkFund) : t('settings:householdSetup.pending')
  const formattedMonthlySavingsGoal =
    monthlySavingsGoal > 0 ? CURRENCY_FORMATTER.format(monthlySavingsGoal) : '$ 0'
  const savingsPresets = buildHouseholdSavingsPresets({
    monthlyIncome,
  })
  const submitState = buildHouseholdSetupSubmitState({
    drafts,
    initialSnapshot,
  })
  const salaryDayNumber = Number(drafts.salaryDayDraft)
  const checkinHourNumber = Number(drafts.checkinHourDraft)
  const usdRate = parseHouseholdSetupMoneyInput(drafts.usdRateDraft)
  const canContinueBasics =
    Number.isFinite(monthlyIncome) &&
    monthlyIncome > 0 &&
    Number.isFinite(usdRate) &&
    usdRate > 0 &&
    Number.isInteger(salaryDayNumber) &&
    salaryDayNumber >= 1 &&
    salaryDayNumber <= 31
  const canContinueSavings =
    Number.isFinite(savingsTargetPercent) &&
    savingsTargetPercent >= 0 &&
    savingsTargetPercent <= 50
  const primaryActionLabel =
    currentStep === TOTAL_STEPS - 1
      ? isInitialFlow
        ? t('settings:householdSetup.saveAndStart')
        : t('settings:householdSetup.saveConfig')
      : t('common:actions.continue')

  const handleSave = () => {
    if (!submitState.input) {
      return
    }

    upsertFinanceMutation.mutate(submitState.input, {
      onError: async (error: unknown) => {
        await triggerHaptic('error')
        Alert.alert(
          t('settings:householdSetup.saveErrorTitle'),
          getErrorMessage(error, t('settings:householdSetup.saveErrorMessage')),
        )
      },
      onSuccess: async () => {
        await triggerHaptic('success')
        router.replace(isInitialFlow ? '/(app)/(tabs)/home' : '/(app)/settings')
      },
    })
  }

  return (
    <Screen
      canGoBack={!isInitialFlow}
      contentContainerStyle={styles.screenContent}
      subtitle={
        isInitialFlow
          ? t('settings:householdSetup.subtitleInitial')
          : t('settings:householdSetup.subtitleRecalibrate')
      }
      title={isInitialFlow ? t('settings:householdSetup.titleInitial') : t('settings:householdSetup.titleRecalibrate')}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

        <HouseholdSetupProgressCard
          currentStep={currentStep + 1}
          subtitle={
            currentStep === 0
              ? t('settings:householdSetup.progressSubtitle0')
              : currentStep === 1
                ? t('settings:householdSetup.progressSubtitle1')
                : t('settings:householdSetup.progressSubtitle2')
          }
          title={
            currentStep === 0
              ? t('settings:householdSetup.progressTitle0')
              : currentStep === 1
                ? t('settings:householdSetup.progressTitle1')
                : t('settings:householdSetup.progressTitle2')
          }
          totalSteps={TOTAL_STEPS}
        />

        {currentStep === 0 ? (
          <BrandedPanel style={styles.card}>
            <SectionHeader
              subtitle={t('settings:householdSetup.step0Subtitle')}
              title={t('settings:householdSetup.step0Title')}
            />
            <NumpadField
              label={t('settings:householdSetup.incomeLabel')}
              value={drafts.incomeDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, incomeDraft: value }))
              }
              formatDisplay={(raw) => formatPriceInputValue(raw, false)}
              placeholder="$ 0"
            />
            <NumpadField
              helper={t('settings:householdSetup.salaryDayHelper')}
              label={t('settings:householdSetup.salaryDayLabel')}
              value={drafts.salaryDayDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, salaryDayDraft: value }))
              }
              placeholder="1"
              maxIntegerDigits={2}
              maxDecimalDigits={0}
            />
            <NumpadField
              label={t('settings:householdSetup.usdRateLabel')}
              value={drafts.usdRateDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, usdRateDraft: value }))
              }
              formatDisplay={(raw) => formatPriceInputValue(raw, false)}
              placeholder="$ 0"
            />
            <SettingsSwitchRow
              description={t('settings:householdSetup.incomeConfirmedDescription')}
              label={t('settings:householdSetup.incomeConfirmedLabel')}
              onValueChange={(value) =>
                setDrafts((current) => ({ ...current, currentIncomeConfirmed: value }))
              }
              value={drafts.currentIncomeConfirmed}
            />
          </BrandedPanel>
        ) : null}

        {currentStep === 1 ? (
          <>
            <HouseholdSavingsResearchPanel
              benchmarkFund={benchmarkFund}
              note={buildHouseholdSavingsResearchNote()}
              stats={buildHouseholdSavingsResearchStats()}
            />
            <BrandedPanel style={styles.card}>
              <SectionHeader
                subtitle={t('settings:householdSetup.step1Subtitle')}
                title={t('settings:householdSetup.step1Title')}
              />
              <View style={styles.summaryStats}>
                <HeroStat
                  compact
                  label={t('settings:householdSetup.recommendedBase')}
                  value={`${TARGET_ESSENTIALS_PERCENT}%`}
                />
              </View>
              <View style={styles.presetList}>
                {savingsPresets.map((preset) => (
                  <HouseholdSavingsPresetCard
                    isSelected={drafts.selectedPresetId === preset.id}
                    key={preset.id}
                    onPress={() => {
                      setDrafts((current) =>
                        applyHouseholdSavingsPreset({ drafts: current, preset }),
                      )
                    }}
                    preset={preset}
                  />
                ))}
              </View>
              <NumpadField
                helper={t('settings:householdSetup.savingsHelper', {
                  amount: formattedMonthlySavingsGoal,
                  flexible: flexibleTargetPercent,
                })}
                label={t('settings:householdSetup.savingsLabel')}
                value={drafts.savingsDraft}
                onChangeRawValue={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    savingsDraft: value,
                    selectedPresetId: 'custom',
                  }))
                }
                formatDisplay={(raw) => (raw ? `${raw}%` : '')}
                placeholder="20%"
                maxIntegerDigits={3}
                maxDecimalDigits={0}
              />
            </BrandedPanel>
          </>
        ) : null}

        {currentStep === 2 ? (
          <>
            <BrandedPanel style={styles.card}>
              <SectionHeader
                subtitle={t('settings:householdSetup.step2Subtitle')}
                title={t('settings:householdSetup.step2Title')}
              />
              <SegmentedControl
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, bufferModeDraft: value }))
                }
                options={[
                  { label: t('settings:householdSetup.bufferNone'), value: 'none' },
                  { label: t('settings:householdSetup.bufferFixed'), value: 'fixed' },
                  { label: '%', value: 'percent' },
                ]}
                value={drafts.bufferModeDraft}
              />
              <NumpadField
                key={drafts.bufferModeDraft}
                helper={
                  drafts.bufferModeDraft === 'none'
                    ? t('settings:householdSetup.bufferHelperNone')
                    : drafts.bufferModeDraft === 'percent'
                      ? t('settings:householdSetup.bufferHelperPercent')
                      : t('settings:householdSetup.bufferHelperFixed')
                }
                label={drafts.bufferModeDraft === 'percent' ? t('settings:householdSetup.bufferLabelPercent') : t('settings:householdSetup.bufferLabel')}
                value={drafts.bufferDraft}
                onChangeRawValue={(value) =>
                  setDrafts((current) => ({ ...current, bufferDraft: value }))
                }
                formatDisplay={(raw) =>
                  drafts.bufferModeDraft === 'percent'
                    ? (raw ? `${raw}%` : '')
                    : formatPriceInputValue(raw, false)
                }
                placeholder={drafts.bufferModeDraft === 'percent' ? '0%' : '$ 0'}
                disabled={drafts.bufferModeDraft === 'none'}
                maxIntegerDigits={drafts.bufferModeDraft === 'percent' ? 3 : undefined}
                maxDecimalDigits={drafts.bufferModeDraft === 'percent' ? 0 : undefined}
              />
              <SettingsSwitchRow
                description={t('settings:householdSetup.nudgesDescription')}
                label={t('settings:householdSetup.nudgesLabel')}
                onValueChange={(value) =>
                  setDrafts((current) => ({ ...current, nudgesEnabledDraft: value }))
                }
                value={drafts.nudgesEnabledDraft}
              />
              <NumpadField
                helper={t('settings:householdSetup.checkinHourHelper')}
                label={t('settings:householdSetup.checkinHourLabel')}
                value={drafts.checkinHourDraft}
                onChangeRawValue={(value) =>
                  setDrafts((current) => ({ ...current, checkinHourDraft: value }))
                }
                placeholder="9"
                maxIntegerDigits={2}
                maxDecimalDigits={0}
              />
            </BrandedPanel>

            <BrandedPanel style={styles.summaryCard} variant="accent">
              <SectionHeader
                subtitle={t('settings:householdSetup.summarySubtitle')}
                title={t('settings:householdSetup.summaryTitle')}
              />
              <View style={styles.summaryStats}>
                <HeroStat label={t('settings:householdSetup.summaryIncome')} value={fieldValues.income || t('settings:rowValue.define')} />
                <HeroStat
                  label={t('settings:householdSetup.summarySavings')}
                  value={
                    fieldValues.savings
                      ? `${fieldValues.savings}% · ${formattedMonthlySavingsGoal}`
                      : t('settings:rowValue.define')
                  }
                />
              </View>
              <View style={styles.summaryStats}>
                <HeroStat
                  compact
                  label={t('settings:householdSetup.summaryNeeds')}
                  value={t('settings:householdSetup.summaryNeedsValue', { percent: TARGET_ESSENTIALS_PERCENT })}
                />
                <HeroStat compact label={t('settings:householdSetup.summaryFlexible')} value={`${flexibleTargetPercent}%`} />
                <HeroStat compact label={t('settings:householdSetup.summaryCheckin')} value={t('settings:householdSetup.summaryCheckinValue', { hour: checkinHourNumber || 9 })} />
              </View>
              <Text style={[styles.summaryNote, { color: theme.colors.textMuted }]}>
                {t('settings:householdSetup.summaryNote', {
                  fund: formattedBenchmarkFund,
                  percent: fieldValues.savings || '0',
                })}
              </Text>
            </BrandedPanel>
          </>
        ) : null}

        <View style={styles.footerActions}>
          {currentStep > 0 ? (
            <AppButton
              fullWidth={false}
              label={t('common:actions.back')}
              onPress={() => setCurrentStep((value) => Math.max(0, value - 1))}
              variant="ghost"
            />
          ) : null}
          <AppButton
            label={primaryActionLabel}
            loading={upsertFinanceMutation.isPending}
            onPress={() => {
              if (currentStep === 0) {
                if (canContinueBasics) {
                  setCurrentStep(1)
                }
                return
              }

              if (currentStep === 1) {
                if (canContinueSavings) {
                  setCurrentStep(2)
                }
                return
              }

              handleSave()
            }}
            variant="primary"
          />
        </View>
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
  card: {
    gap: 18,
  },
  presetList: {
    gap: 10,
  },
  summaryCard: {
    gap: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryNote: {
    ...typography.bodySmall,
  },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
})
