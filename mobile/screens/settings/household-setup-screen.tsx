import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
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
  HOUSEHOLD_SAVINGS_RESEARCH_NOTE,
  HOUSEHOLD_SAVINGS_RESEARCH_STATS,
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
  }
}

export function HouseholdSetupScreen({ familyId }: HouseholdSetupScreenProps) {
  const { initial } = useLocalSearchParams<{ initial?: string }>()
  const isInitialFlow = initial === '1'
  const financeQuery = useFamilyFinance(familyId)
  const financeSnapshot = financeQuery.data
    ? buildFamilyFinanceSnapshot(financeQuery.data)
    : null
  const financeSeedKey = financeSnapshot ? JSON.stringify(financeSnapshot) : 'empty'

  if (financeQuery.isLoading && !financeSnapshot) {
    return (
      <Screen canGoBack={!isInitialFlow} title="Configuracion del hogar">
        <LoadingBlock label="Preparando asistente..." />
      </Screen>
    )
  }

  if (!financeSnapshot) {
    return (
      <Screen canGoBack={!isInitialFlow} title="Configuracion del hogar">
        <ErrorState
          description="No pudimos preparar la configuracion inicial del hogar."
          title="No se pudo abrir el wizard"
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
  const { theme } = useAppTheme()
  const upsertFinanceMutation = useUpsertFamilyFinance(familyId)
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
    benchmarkFund > 0 ? CURRENCY_FORMATTER.format(benchmarkFund) : 'pendiente'
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
        ? 'Guardar y empezar'
        : 'Guardar configuracion'
      : 'Continuar'

  const handleSave = () => {
    if (!submitState.input) {
      return
    }

    upsertFinanceMutation.mutate(submitState.input, {
      onError: async (error: unknown) => {
        await triggerHaptic('error')
        Alert.alert(
          'Algo salio mal',
          getErrorMessage(error, 'No se pudo guardar la configuracion del hogar.'),
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
          ? 'Deja listo ingreso, distribucion objetivo, resguardo diario y recordatorios del hogar.'
          : 'Vuelve a pasar por la configuracion guiada para recalibrar el hogar.'
      }
      title={isInitialFlow ? 'Configura tu hogar' : 'Reconfigurar hogar'}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

        <HouseholdSetupProgressCard
          currentStep={currentStep + 1}
          subtitle={
            currentStep === 0
              ? 'Primero definimos la base economica del hogar.'
              : currentStep === 1
                ? 'Despues fijamos la distribucion porcentual del ingreso.'
                : 'Por ultimo protegemos el dia a dia con colchones y nudges.'
          }
          title={
            currentStep === 0
              ? 'Base del hogar'
              : currentStep === 1
                ? 'Distribucion objetivo'
                : 'Proteccion diaria'
          }
          totalSteps={TOTAL_STEPS}
        />

        {currentStep === 0 ? (
          <BrandedPanel style={styles.card}>
            <SectionHeader
              subtitle="Estos datos ordenan el ciclo de cobro y las referencias principales del hogar."
              title="Ingresos y ciclo"
            />
            <NumpadField
              label="Ingreso mensual del hogar"
              value={drafts.incomeDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, incomeDraft: value }))
              }
              formatDisplay={(raw) => formatPriceInputValue(raw, false)}
              placeholder="$ 0"
            />
            <NumpadField
              helper="Dia del mes en que entra el ingreso principal."
              label="Dia de cobro"
              value={drafts.salaryDayDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, salaryDayDraft: value }))
              }
              placeholder="1"
              maxIntegerDigits={2}
              maxDecimalDigits={0}
            />
            <NumpadField
              label="Cotizacion USD"
              value={drafts.usdRateDraft}
              onChangeRawValue={(value) =>
                setDrafts((current) => ({ ...current, usdRateDraft: value }))
              }
              formatDisplay={(raw) => formatPriceInputValue(raw, false)}
              placeholder="$ 0"
            />
            <SettingsSwitchRow
              description="Si ya entro el ingreso principal, marcamos este ciclo como abierto y evitamos friccion inicial."
              label="Este mes ya entro el ingreso"
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
              note={HOUSEHOLD_SAVINGS_RESEARCH_NOTE}
              stats={HOUSEHOLD_SAVINGS_RESEARCH_STATS}
            />
            <BrandedPanel style={styles.card}>
              <SectionHeader
                subtitle="Usamos 50% para necesidades como baseline y desplazamos el resto entre ahorro y gasto flexible."
                title="Distribucion del ingreso"
              />
              <View style={styles.summaryStats}>
                <HeroStat
                  compact
                  label="Base recomendada"
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
                helper={`Equivale a ${formattedMonthlySavingsGoal} por mes. Gasto flexible objetivo: ${flexibleTargetPercent}%.`}
                label="Ahorro objetivo (%)"
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
                subtitle="Define cuanto margen quieres proteger antes de repartir el gasto por dia."
                title="Resguardo diario"
              />
              <SegmentedControl
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, bufferModeDraft: value }))
                }
                options={[
                  { label: 'Sin colchon', value: 'none' },
                  { label: '$ Fijo', value: 'fixed' },
                  { label: '%', value: 'percent' },
                ]}
                value={drafts.bufferModeDraft}
              />
              <NumpadField
                key={drafts.bufferModeDraft}
                helper={
                  drafts.bufferModeDraft === 'none'
                    ? 'Todo el disponible se reparte dentro del ciclo.'
                    : drafts.bufferModeDraft === 'percent'
                      ? 'Porcentaje reservado del presupuesto variable.'
                      : 'Monto fijo reservado por fuera del operativo diario.'
                }
                label={drafts.bufferModeDraft === 'percent' ? 'Colchon (%)' : 'Colchon'}
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
                description="Activa recordatorios de apertura diaria y avisos cuando el dia se empieza a apretar."
                label="Nudges inteligentes"
                onValueChange={(value) =>
                  setDrafts((current) => ({ ...current, nudgesEnabledDraft: value }))
                }
                value={drafts.nudgesEnabledDraft}
              />
              <NumpadField
                helper="Hora de referencia para el check-in diario. Usa formato 0 a 23."
                label="Hora del check-in"
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
                subtitle="Resumen del setup antes de guardar."
                title="Asi queda el hogar"
              />
              <View style={styles.summaryStats}>
                <HeroStat label="Ingreso" value={fieldValues.income || 'Definir'} />
                <HeroStat
                  label="Ahorro target"
                  value={
                    fieldValues.savings
                      ? `${fieldValues.savings}% · ${formattedMonthlySavingsGoal}`
                      : 'Definir'
                  }
                />
              </View>
              <View style={styles.summaryStats}>
                <HeroStat
                  compact
                  label="Necesidades"
                  value={`${TARGET_ESSENTIALS_PERCENT}% objetivo`}
                />
                <HeroStat compact label="Flexible" value={`${flexibleTargetPercent}%`} />
                <HeroStat compact label="Check-in" value={`${checkinHourNumber || 9} hs`} />
              </View>
              <Text style={[styles.summaryNote, { color: theme.colors.textMuted }]}>
                Fondo base de {formattedBenchmarkFund} y ahorro mensual derivado de {fieldValues.savings || '0'}% del ingreso.
              </Text>
            </BrandedPanel>
          </>
        ) : null}

        <View style={styles.footerActions}>
          {currentStep > 0 ? (
            <AppButton
              fullWidth={false}
              label="Volver"
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
