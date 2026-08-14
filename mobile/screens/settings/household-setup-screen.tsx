import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  HouseholdSetupCard,
  HouseholdSetupProgressCard,
  HouseholdSavingsPresetCard,
  HouseholdSavingsResearchPanel,
} from '@/components/settings/household-setup-sections'
import { HeroStat, SettingsSwitchRow } from '@/components/settings/settings-primitives'
import { NeoButton } from '@/components/ui/neo-button'
import { LoadingBlock } from '@/components/ui/loading-block'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { NumpadField } from '@/components/ui/numpad-field'
import { formatPriceInputValue } from '@/utils/money'
import {
  type FamilyFinance,
  type FamilyFinanceInputSnapshot,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useUpdateMyIncomeContribution } from '@/features/family/use-family-actions'
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
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { getNumberFormat } from '@/lib/i18n/active-locale'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'
import { getErrorMessage } from '@/utils/error-message'
import { nunitoFamily } from '@/theme/typography'

interface HouseholdSetupScreenProps {
  familyId: string
}

interface HouseholdSetupWizardContentProps extends HouseholdSetupScreenProps {
  initialSnapshot: FamilyFinanceInputSnapshot
  isInitialFlow: boolean
}

const TOTAL_STEPS = 3
const CURRENCY_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  currency: 'ARS',
  style: 'currency',
}
const formatCurrency = (value: number) =>
  getNumberFormat(CURRENCY_FORMAT_OPTIONS).format(value)

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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { initial } = useLocalSearchParams<{ initial?: string }>()
  const isInitialFlow = initial === '1'
  const financeQuery = useFamilyFinance(familyId)
  const financeSnapshot = financeQuery.data
    ? buildFamilyFinanceSnapshot(financeQuery.data)
    : null
  const financeSeedKey = financeSnapshot ? JSON.stringify(financeSnapshot) : 'empty'

  if (financeQuery.isLoading && !financeSnapshot) {
    return (
      // `household-setup` se registra con `presentation: 'modal'`
      // (`app-stack-shell.tsx`): en iOS es una hoja que arranca debajo de la
      // isla y el inset superior del DISPOSITIVO no le corresponde. Va en LAS
      // CUATRO ramas de render de la ruta —si faltara en alguna, el contenido
      // saltaría ~59pt al pasar de cargando a cargado. En Android la ruta es
      // `card` y el flag se ignora. Ver el docblock de `presentedAsSheet`.
      <Screen
        backgroundColor={neo.bg}
        canGoBack={!isInitialFlow}
        presentedAsSheet
        title={t('settings:householdSetup.screenTitle')}
        titleColor={neo.text}
      >
        <LoadingBlock label={t('settings:householdSetup.loading')} skin="neo" />
      </Screen>
    )
  }

  if (!financeSnapshot) {
    return (
      <Screen
        backgroundColor={neo.bg}
        canGoBack={!isInitialFlow}
        presentedAsSheet
        title={t('settings:householdSetup.screenTitle')}
        titleColor={neo.text}
      >
        <NeoStateBlock
          actionLabel={t('states:errorState.action')}
          description={t('settings:householdSetup.errorDescription')}
          icon="error-outline"
          title={t('settings:householdSetup.errorTitle')}
          tone="error"
          onAction={() => {
            void financeQuery.refetch()
          }}
        />
      </Screen>
    )
  }

  // Hogar en modo INGRESO DINÁMICO: el wizard entero (sueldo → % de
  // ahorro → resumen) no aplica — no hay sueldo que declarar ni ahorro
  // por % que configurar, y completarlo re-activaría ambos. Se explica
  // el modo y se sigue de largo.
  if (financeQuery.data?.income_mode === 'dynamic') {
    return <HouseholdSetupDynamicNotice isInitialFlow={isInitialFlow} />
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

/** Aviso para hogares dinámicos: explica el modo y saca al usuario del
 *  wizard de sueldo/ahorro sin dejarlo pisar la config. */
function HouseholdSetupDynamicNotice({ isInitialFlow }: { isInitialFlow: boolean }) {
  const router = useRouter()
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack={!isInitialFlow}
      presentedAsSheet
      title={t('settings:householdSetup.screenTitle')}
      titleColor={neo.text}
    >
      <HouseholdSetupCard
        subtitle={t('settings:householdSetup.dynamicSubtitle')}
        title={t('settings:householdSetup.dynamicTitle')}
      >
        <NeoButton
          block
          haptic="light"
          label={t('settings:householdSetup.dynamicCta')}
          onPress={() => {
            router.replace(isInitialFlow ? '/(app)/(tabs)/home' : '/(app)/settings')
          }}
          variant="primary"
        />
      </HouseholdSetupCard>
    </Screen>
  )
}

function HouseholdSetupWizardContent({
  familyId,
  initialSnapshot,
  isInitialFlow,
}: HouseholdSetupWizardContentProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  // userId hace falta para que `useUpsertFamilyFinance` pueda invalidar
  // home_snapshot (root key) tras el upsert. Sin esto, los users veían
  // valores stale en el hero hasta el próximo refetch manual. Code
  // review screens-B3.
  const sessionUserId = useAuthSession().data?.user?.id
  const upsertFinanceMutation = useUpsertFamilyFinance(familyId, sessionUserId)
  const updateMyContributionMutation = useUpdateMyIncomeContribution(sessionUserId, familyId)
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
    benchmarkFund > 0 ? formatCurrency(benchmarkFund) : t('settings:householdSetup.pending')
  const formattedMonthlySavingsGoal =
    monthlySavingsGoal > 0 ? formatCurrency(monthlySavingsGoal) : '$ 0'
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
        toast.error(getErrorMessage(error, t('settings:householdSetup.saveErrorMessage')))
      },
      onSuccess: async () => {
        // El ingreso del dueño debe vivir como su monthly_income_contribution:
        // family_finance.monthly_income es DERIVADO (= Σ de contribuciones, vía
        // recompute_family_income). El upsert ya no escribe monthly_income (lo
        // strippea el repo), así que persistimos el ingreso editado acá. Sin esto
        // el ingreso se perdía (escrito a ningún lado).
        try {
          await updateMyContributionMutation.mutateAsync(monthlyIncome)
        } catch (error) {
          await triggerHaptic('error')
          toast.error(getErrorMessage(error, t('settings:householdSetup.saveErrorMessage')))
          return
        }
        await triggerHaptic('success')
        router.replace(isInitialFlow ? '/(app)/(tabs)/home' : '/(app)/settings')
      },
    })
  }

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack={!isInitialFlow}
      contentContainerStyle={styles.screenContent}
      // Cuarta rama de la MISMA ruta modal — ver el comentario de la rama de
      // carga arriba.
      presentedAsSheet
      subtitle={
        isInitialFlow
          ? t('settings:householdSetup.subtitleInitial')
          : t('settings:householdSetup.subtitleRecalibrate')
      }
      title={isInitialFlow ? t('settings:householdSetup.titleInitial') : t('settings:householdSetup.titleRecalibrate')}
      titleColor={neo.text}
    >
      <View style={styles.sectionStack}>
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
          <HouseholdSetupCard
            subtitle={t('settings:householdSetup.step0Subtitle')}
            title={t('settings:householdSetup.step0Title')}
          >
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
          </HouseholdSetupCard>
        ) : null}

        {currentStep === 1 ? (
          <>
            <HouseholdSavingsResearchPanel
              benchmarkFund={benchmarkFund}
              note={buildHouseholdSavingsResearchNote()}
              stats={buildHouseholdSavingsResearchStats()}
            />
            <HouseholdSetupCard
              subtitle={t('settings:householdSetup.step1Subtitle')}
              title={t('settings:householdSetup.step1Title')}
            >
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
            </HouseholdSetupCard>
          </>
        ) : null}

        {currentStep === 2 ? (
          <>
            <HouseholdSetupCard
              subtitle={t('settings:householdSetup.step2Subtitle')}
              title={t('settings:householdSetup.step2Title')}
            >
              <SegmentedControl
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, bufferModeDraft: value }))
                }
                options={[
                  { label: t('settings:householdSetup.bufferNone'), value: 'none' },
                  { label: t('settings:householdSetup.bufferFixed'), value: 'fixed' },
                  { label: '%', value: 'percent' },
                ]}
                skin="neo"
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
            </HouseholdSetupCard>

            {/* `raisedXl` y no `hero`: los `HeroStat` del resumen son pozos
                del canvas (`well` + tinta oscura) y sobre el gradiente verde
                del hero dejarían de leerse como parte del sistema. */}
            <HouseholdSetupCard
              subtitle={t('settings:householdSetup.summarySubtitle')}
              title={t('settings:householdSetup.summaryTitle')}
              variant="raisedXl"
            >
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
              <Text style={[styles.summaryNote, { color: neo.textMuted }]}>
                {t('settings:householdSetup.summaryNote', {
                  fund: formattedBenchmarkFund,
                  percent: fieldValues.savings || '0',
                })}
              </Text>
            </HouseholdSetupCard>
          </>
        ) : null}

        <View style={styles.footerActions}>
          {currentStep > 0 ? (
            <NeoButton
              fullWidth={false}
              haptic="none"
              label={t('common:actions.back')}
              onPress={() => setCurrentStep((value) => Math.max(0, value - 1))}
              variant="ghost"
            />
          ) : null}
          <NeoButton
            block
            haptic="light"
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
  },
  presetList: {
    gap: 10,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryNote: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
})
