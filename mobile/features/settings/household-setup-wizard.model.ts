import {
  buildFinanceDraftState,
  buildFinanceSubmitState,
  type BufferMode,
  type FinanceSettingsDrafts,
  sanitizeMoneyInput,
  sanitizePercentageInput,
} from '@/features/settings/settings-form.model'
import {
  deriveSavingsGoalAmount,
  TARGET_ESSENTIALS_PERCENT,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
export { resolveFlexibleTargetPercent } from '@/features/finance/family-finance.model'
import { formatPriceInputValue, parsePrice, serializePrice } from '@/utils/money'

const EMERGENCY_FUND_MONTHS_BENCHMARK = 3
const ESSENTIAL_SPEND_FALLBACK_RATE = TARGET_ESSENTIALS_PERCENT / 100
const WIZARD_ROUNDING_UNIT = 500

export type HouseholdSavingsPresetId = 'steady' | 'balanced' | 'resilient' | 'custom'

export interface HouseholdSetupDraftState extends FinanceSettingsDrafts {
  currentIncomeConfirmed: boolean
  essentialsDraft: string
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

export const HOUSEHOLD_SAVINGS_RESEARCH_STATS: HouseholdSavingsResearchStat[] = [
  {
    detail: 'tenia ahorro para cubrir tres meses de gastos',
    label: 'Fondo de 3 meses',
    source: 'Fed SHED 2024',
    value: '55%',
  },
  {
    detail: 'de quienes siempre cierran el mes con resto',
    label: 'Mes con resto',
    source: 'Fed SHED 2024',
    value: '85%',
  },
]

export const HOUSEHOLD_SAVINGS_RESEARCH_NOTE =
  'Tomamos la regla 50/20/30 del CFPB como punto de partida y proponemos subir ahorro a 25%-30% recortando gasto flexible. CFPB y FDIC tambien recomiendan automatizar el ahorro al cobrar.'

function roundWizardMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.round(value / WIZARD_ROUNDING_UNIT) * WIZARD_ROUNDING_UNIT
}

function resolveEstimatedEssentialMonthlyCost(monthlyIncome: number, essentialMonthlyCost: number) {
  if (Number.isFinite(essentialMonthlyCost) && essentialMonthlyCost > 0) {
    return essentialMonthlyCost
  }

  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return 0
  }

  return roundWizardMoney(monthlyIncome * ESSENTIAL_SPEND_FALLBACK_RATE)
}

export function resolveCurrentEssentialsPercent({
  essentialMonthlyCost,
  monthlyIncome,
}: {
  essentialMonthlyCost: number
  monthlyIncome: number
}) {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return 0
  }

  const resolvedEssentialMonthlyCost = resolveEstimatedEssentialMonthlyCost(
    monthlyIncome,
    essentialMonthlyCost,
  )

  if (resolvedEssentialMonthlyCost <= 0) {
    return 0
  }

  return Math.min(100, Math.round((resolvedEssentialMonthlyCost / monthlyIncome) * 100))
}

function buildHouseholdSavingsPreset({
  essentialMonthlyCost,
  flexiblePercent,
  suggestedBufferMode,
  suggestedBufferValue,
  id,
  monthlyIncome,
  savingsPercent,
  subtitle,
  title,
}: {
  essentialMonthlyCost: number
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
    essentialMonthlyCost,
    monthlyIncome,
  })
  const monthlyGoal = roundWizardMoney(
    deriveSavingsGoalAmount(monthlyIncome, savingsPercent),
  )

  return {
    helper:
      monthlyGoal > 0
        ? `${TARGET_ESSENTIALS_PERCENT}% necesidades, ${flexiblePercent}% flexible y ${savingsPercent}% ahorro. El fondo de ${EMERGENCY_FUND_MONTHS_BENCHMARK} meses se arma en ~${resolveMonthsToBenchmark({ benchmarkFund, monthlyGoal })} meses.`
        : 'Define un ingreso para sugerir una distribucion objetivo.',
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
  const estimatedEssentialMonthlyCost = resolveEstimatedEssentialMonthlyCost(
    snapshot.monthlyIncome,
    snapshot.essentialMonthlyCost,
  )

  return {
    ...financeDrafts,
    currentIncomeConfirmed: Boolean(snapshot.lastSalaryConfirmedAt),
    essentialsDraft:
      estimatedEssentialMonthlyCost > 0 ? serializePrice(estimatedEssentialMonthlyCost) : '',
    selectedPresetId: 'custom',
  }
}

export function buildHouseholdSavingsPresets({
  essentialMonthlyCost,
  monthlyIncome,
}: {
  essentialMonthlyCost: number
  monthlyIncome: number
}) {
  const resolvedEssentialMonthlyCost = resolveEstimatedEssentialMonthlyCost(
    monthlyIncome,
    essentialMonthlyCost,
  )

  return [
    buildHouseholdSavingsPreset({
      essentialMonthlyCost: resolvedEssentialMonthlyCost,
      flexiblePercent: 30,
      id: 'steady',
      monthlyIncome,
      savingsPercent: 20,
      suggestedBufferMode: 'none',
      suggestedBufferValue: 0,
      subtitle: 'Baseline del CFPB: necesitas orden, pero sin asfixiar el gasto flexible.',
      title: 'Base 50/30/20',
    }),
    buildHouseholdSavingsPreset({
      essentialMonthlyCost: resolvedEssentialMonthlyCost,
      flexiblePercent: 25,
      id: 'balanced',
      monthlyIncome,
      savingsPercent: 25,
      suggestedBufferMode: 'percent',
      suggestedBufferValue: 5,
      subtitle: 'Recorta parte del gasto flexible para fortalecer la reserva mensual.',
      title: 'Ahorro reforzado',
    }),
    buildHouseholdSavingsPreset({
      essentialMonthlyCost: resolvedEssentialMonthlyCost,
      flexiblePercent: 20,
      id: 'resilient',
      monthlyIncome,
      savingsPercent: 30,
      suggestedBufferMode: 'percent',
      suggestedBufferValue: 10,
      subtitle: 'Prioriza construir caja rapido y protege mas el flujo del hogar.',
      title: 'Reserva acelerada',
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
  essentialsFocused,
  incomeFocused,
  savingsFocused,
  usdRateFocused,
}: {
  bufferFocused: boolean
  drafts: HouseholdSetupDraftState
  essentialsFocused: boolean
  incomeFocused: boolean
  savingsFocused: boolean
  usdRateFocused: boolean
}) {
  const financeFieldValues = buildHouseholdSetupFinanceFieldValues({
    bufferFocused,
    drafts,
    incomeFocused,
    savingsFocused,
    usdRateFocused,
  })

  return {
    ...financeFieldValues,
    essentials: formatPriceInputValue(drafts.essentialsDraft, essentialsFocused),
  }
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

export function resolveEmergencyFundTarget({
  essentialMonthlyCost,
  monthlyIncome,
}: {
  essentialMonthlyCost: number
  monthlyIncome: number
}) {
  const resolvedEssentialMonthlyCost = resolveEstimatedEssentialMonthlyCost(
    monthlyIncome,
    essentialMonthlyCost,
  )

  return roundWizardMoney(resolvedEssentialMonthlyCost * EMERGENCY_FUND_MONTHS_BENCHMARK)
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
    essentialMonthlyCost: parsePrice(drafts.essentialsDraft),
    lastSalaryConfirmedAt: resolvedLastSalaryConfirmedAt,
  })
}

export function sanitizeHouseholdSetupMoneyInput(value: string) {
  return sanitizeMoneyInput(value)
}

export function parseHouseholdSetupMoneyInput(value: string) {
  return parsePrice(value)
}

export function sanitizeHouseholdSetupPercentInput(value: string) {
  return sanitizePercentageInput(value)
}

export function isHouseholdSetupPending(snapshot: FamilyFinanceInputSnapshot) {
  return snapshot.monthlyIncome <= 0
}
