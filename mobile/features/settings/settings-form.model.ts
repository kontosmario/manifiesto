import {
  buildFamilyFinanceInput,
  deriveSavingsGoalAmount,
  MAX_SAVINGS_GOAL_PERCENT,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import {
  normalizePriceInput,
  parsePrice,
  serializePrice,
} from '@/utils/money'

export type BufferMode = 'none' | 'fixed' | 'percent'

export interface FinanceSettingsDrafts {
  bufferDraft: string
  bufferModeDraft: BufferMode
  checkinHourDraft: string
  incomeDraft: string
  nudgesEnabledDraft: boolean
  salaryDayDraft: string
  savingsDraft: string
  usdRateDraft: string
}

export function buildFinanceDraftState(snapshot: FamilyFinanceInputSnapshot): FinanceSettingsDrafts {
  return {
    bufferDraft: serializePrice(snapshot.dailyBudgetBufferValue),
    bufferModeDraft: snapshot.dailyBudgetBufferMode,
    checkinHourDraft: String(snapshot.dailyBudgetCheckinHour),
    incomeDraft: serializePrice(snapshot.monthlyIncome),
    nudgesEnabledDraft: snapshot.dailyBudgetNudgesEnabled,
    salaryDayDraft: String(snapshot.salaryPaymentDay),
    savingsDraft: String(snapshot.savingsGoalPercent),
    usdRateDraft: serializePrice(snapshot.usdExchangeRate),
  }
}

export function sanitizeMoneyInput(value: string) {
  return normalizePriceInput(value)
}

export function sanitizePercentageInput(value: string) {
  return value.replace(/[^\d]/g, '').slice(0, 2)
}

export function buildFinanceSubmitState({
  drafts,
  lastSalaryConfirmedAt,
  currentCycleStartingBalance = null,
  currentCycleAnchor = null,
}: {
  drafts: FinanceSettingsDrafts
  lastSalaryConfirmedAt: string | null
  currentCycleStartingBalance?: number | null
  currentCycleAnchor?: string | null
}): {
  canSaveFinance: boolean
  input: ReturnType<typeof buildFamilyFinanceInput> | null
} {
  const salaryDayNumber = Number(drafts.salaryDayDraft)
  const checkinHourNumber = Number(drafts.checkinHourDraft)
  const income = parsePrice(drafts.incomeDraft)
  const savingsPercent = Number(drafts.savingsDraft)
  const usdRate = parsePrice(drafts.usdRateDraft)
  const buffer = parsePrice(drafts.bufferDraft)

  const canSaveFinance =
    Number.isFinite(income) &&
    Number.isFinite(savingsPercent) &&
    Number.isFinite(usdRate) &&
    Number.isFinite(buffer) &&
    buffer >= 0 &&
    savingsPercent >= 0 &&
    savingsPercent <= MAX_SAVINGS_GOAL_PERCENT &&
    Number.isInteger(checkinHourNumber) &&
    checkinHourNumber >= 0 &&
    checkinHourNumber <= 23 &&
    Number.isInteger(salaryDayNumber) &&
    salaryDayNumber >= 1 &&
    salaryDayNumber <= 31

  if (!canSaveFinance) {
    return {
      canSaveFinance,
      input: null,
    }
  }

  return {
    canSaveFinance: true,
    input: buildFamilyFinanceInput({
      dailyBudgetBufferMode: drafts.bufferModeDraft,
      dailyBudgetBufferValue: buffer,
      dailyBudgetCheckinHour: checkinHourNumber,
      dailyBudgetNudgesEnabled: drafts.nudgesEnabledDraft,
      lastSalaryConfirmedAt,
      currentCycleStartingBalance,
      currentCycleAnchor,
      monthlyIncome: income,
      salaryPaymentDay: salaryDayNumber,
      savingsGoal: deriveSavingsGoalAmount(income, savingsPercent),
      savingsGoalPercent: savingsPercent,
      usdExchangeRate: usdRate,
    }),
  }
}
