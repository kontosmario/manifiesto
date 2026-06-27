import {
  buildFinanceDraftState,
  buildFinanceSubmitState,
  type BufferMode,
  type FinanceSettingsDrafts,
} from '@/features/settings/settings-form.model'
import {
  deriveSavingsGoalAmount,
  TARGET_ESSENTIALS_PERCENT,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
export { resolveFlexibleTargetPercent } from '@/features/finance/family-finance.model'
import { formatPriceInputValue, parsePrice, serializePrice } from '@/utils/money'
import i18n from '@/lib/i18n'

const EMERGENCY_FUND_MONTHS_BENCHMARK = 3
const WIZARD_ROUNDING_UNIT = 500
// Fallback used by `resolveEmergencyFundTarget` when we no longer track a
// dedicated essentials figure: half the monthly income stands in as a
// proxy for "one month of non-negotiables", consistent with the 50/30/20
// baseline the wizard presets use.
const EMERGENCY_FUND_INCOME_PROXY_RATE = 0.5

export type HouseholdSavingsPresetId = 'steady' | 'balanced' | 'resilient' | 'custom'

export interface HouseholdSetupDraftState extends FinanceSettingsDrafts {
  currentIncomeConfirmed: boolean
  selectedPresetId: HouseholdSavingsPresetId
}

export interface HouseholdSavingsResearchStat {
  detail: string
  label: string
  source: string
  value: string
}

export interface HouseholdSavingsPreset {
  flexiblePercent: number
  helper: string
  id: Exclude<HouseholdSavingsPresetId, 'custom'>
  monthlyGoal: number
  monthsToBenchmark: number
  savingsPercent: number
  suggestedBufferMode: BufferMode
  suggestedBufferValue: number
  subtitle: string
  title: string
}

export function buildHouseholdSavingsResearchStats(): HouseholdSavingsResearchStat[] {
  return [
    {
      detail: i18n.t('settings:householdSetup.researchStat1Detail'),
      label: i18n.t('settings:householdSetup.researchStat1Label'),
      source: 'Fed SHED 2024',
      value: '55%',
    },
    {
      detail: i18n.t('settings:householdSetup.researchStat2Detail'),
      label: i18n.t('settings:householdSetup.researchStat2Label'),
      source: 'Fed SHED 2024',
      value: '85%',
    },
  ]
}

export function buildHouseholdSavingsResearchNote(): string {
  return i18n.t('settings:householdSetup.researchNote')
}

function roundWizardMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.round(value / WIZARD_ROUNDING_UNIT) * WIZARD_ROUNDING_UNIT
}

function buildHouseholdSavingsPreset({
  flexiblePercent,
  suggestedBufferMode,
  suggestedBufferValue,
  id,
  monthlyIncome,
  savingsPercent,
  subtitle,
  title,
}: {
  flexiblePercent: number
  id: Exclude<HouseholdSavingsPresetId, 'custom'>
  monthlyIncome: number
  savingsPercent: number
  suggestedBufferMode: BufferMode
  suggestedBufferValue: number
  subtitle: string
  title: string
}): HouseholdSavingsPreset {
  const benchmarkFund = resolveEmergencyFundTarget({
    monthlyIncome,
  })
  const monthlyGoal = roundWizardMoney(
    deriveSavingsGoalAmount(monthlyIncome, savingsPercent),
  )

  return {
    helper:
      monthlyGoal > 0
        ? i18n.t('settings:householdSetup.presetHelper', {
            needs: TARGET_ESSENTIALS_PERCENT,
            flexible: flexiblePercent,
            savings: savingsPercent,
            months: EMERGENCY_FUND_MONTHS_BENCHMARK,
            toBenchmark: resolveMonthsToBenchmark({ benchmarkFund, monthlyGoal }),
          })
        : i18n.t('settings:householdSetup.presetHelperEmpty'),
    flexiblePercent,
    id,
    monthlyGoal,
    monthsToBenchmark: resolveMonthsToBenchmark({ benchmarkFund, monthlyGoal }),
    savingsPercent,
    suggestedBufferMode,
    suggestedBufferValue,
    subtitle,
    title,
  }
}

export function buildHouseholdSetupDraftState(
  snapshot: FamilyFinanceInputSnapshot,
): HouseholdSetupDraftState {
  const financeDrafts = buildFinanceDraftState(snapshot)

  return {
    ...financeDrafts,
    currentIncomeConfirmed: Boolean(snapshot.lastSalaryConfirmedAt),
    selectedPresetId: 'custom',
  }
}

export function buildHouseholdSavingsPresets({
  monthlyIncome,
}: {
  monthlyIncome: number
}) {
  return [
    buildHouseholdSavingsPreset({
      flexiblePercent: 30,
      id: 'steady',
      monthlyIncome,
      savingsPercent: 20,
      suggestedBufferMode: 'none',
      suggestedBufferValue: 0,
      subtitle: i18n.t('settings:householdSetup.presetSteadySubtitle'),
      title: i18n.t('settings:householdSetup.presetSteadyTitle'),
    }),
    buildHouseholdSavingsPreset({
      flexiblePercent: 25,
      id: 'balanced',
      monthlyIncome,
      savingsPercent: 25,
      suggestedBufferMode: 'percent',
      suggestedBufferValue: 5,
      subtitle: i18n.t('settings:householdSetup.presetBalancedSubtitle'),
      title: i18n.t('settings:householdSetup.presetBalancedTitle'),
    }),
    buildHouseholdSavingsPreset({
      flexiblePercent: 20,
      id: 'resilient',
      monthlyIncome,
      savingsPercent: 30,
      suggestedBufferMode: 'percent',
      suggestedBufferValue: 10,
      subtitle: i18n.t('settings:householdSetup.presetResilientSubtitle'),
      title: i18n.t('settings:householdSetup.presetResilientTitle'),
    }),
  ] as const
}

export function applyHouseholdSavingsPreset({
  drafts,
  preset,
}: {
  drafts: HouseholdSetupDraftState
  preset: HouseholdSavingsPreset
}): HouseholdSetupDraftState {
  return {
    ...drafts,
    bufferDraft: serializePrice(preset.suggestedBufferValue),
    bufferModeDraft: preset.suggestedBufferMode,
    savingsDraft: String(preset.savingsPercent),
    selectedPresetId: preset.id,
  }
}

export function buildHouseholdSetupFieldValues({
  bufferFocused,
  drafts,
  incomeFocused,
  savingsFocused,
  usdRateFocused,
}: {
  bufferFocused: boolean
  drafts: HouseholdSetupDraftState
  incomeFocused: boolean
  savingsFocused: boolean
  usdRateFocused: boolean
}) {
  return buildHouseholdSetupFinanceFieldValues({
    bufferFocused,
    drafts,
    incomeFocused,
    savingsFocused,
    usdRateFocused,
  })
}

function buildHouseholdSetupFinanceFieldValues({
  bufferFocused,
  drafts,
  incomeFocused,
  savingsFocused,
  usdRateFocused,
}: {
  bufferFocused: boolean
  drafts: HouseholdSetupDraftState
  incomeFocused: boolean
  savingsFocused: boolean
  usdRateFocused: boolean
}) {
  void savingsFocused

  return {
    buffer:
      drafts.bufferModeDraft === 'percent'
        ? drafts.bufferDraft
        : formatPriceInputValue(drafts.bufferDraft, bufferFocused),
    income: formatPriceInputValue(drafts.incomeDraft, incomeFocused),
    savings: drafts.savingsDraft,
    usdRate: formatPriceInputValue(drafts.usdRateDraft, usdRateFocused),
  }
}

// No longer tracks essentials separately — estimates one month of
// non-negotiables as half the monthly income (50/30/20 baseline), then
// multiplies by the emergency-fund month benchmark.
export function resolveEmergencyFundTarget({
  monthlyIncome,
}: {
  monthlyIncome: number
}) {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return 0
  }

  const proxyMonthlyEssentials = monthlyIncome * EMERGENCY_FUND_INCOME_PROXY_RATE
  return roundWizardMoney(proxyMonthlyEssentials * EMERGENCY_FUND_MONTHS_BENCHMARK)
}

export function resolveMonthsToBenchmark({
  benchmarkFund,
  monthlyGoal,
}: {
  benchmarkFund: number
  monthlyGoal: number
}) {
  if (!Number.isFinite(benchmarkFund) || benchmarkFund <= 0) {
    return 0
  }

  if (!Number.isFinite(monthlyGoal) || monthlyGoal <= 0) {
    return 0
  }

  return Math.ceil(benchmarkFund / monthlyGoal)
}

export function buildHouseholdSetupSubmitState({
  drafts,
  initialSnapshot,
}: {
  drafts: HouseholdSetupDraftState
  initialSnapshot: FamilyFinanceInputSnapshot
}) {
  const salaryDayNumber = Number(drafts.salaryDayDraft)
  const shouldRefreshSalaryConfirmationStamp =
    !initialSnapshot.lastSalaryConfirmedAt || salaryDayNumber !== initialSnapshot.salaryPaymentDay
  const resolvedLastSalaryConfirmedAt = drafts.currentIncomeConfirmed
    ? shouldRefreshSalaryConfirmationStamp
      ? new Date().toISOString()
      : initialSnapshot.lastSalaryConfirmedAt
    : null

  return buildFinanceSubmitState({
    drafts,
    lastSalaryConfirmedAt: resolvedLastSalaryConfirmedAt,
  })
}

export function parseHouseholdSetupMoneyInput(value: string) {
  return parsePrice(value)
}
