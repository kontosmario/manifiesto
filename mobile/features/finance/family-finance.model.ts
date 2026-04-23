import type { PostgrestError } from '@supabase/supabase-js'

export interface FinanceStoragePayload {
  daily_budget_buffer_mode: 'none' | 'fixed' | 'percent'
  daily_budget_buffer_value: number
  daily_budget_checkin_hour: number
  daily_budget_nudges_enabled: boolean
  essential_monthly_cost: number
  monthly_income: number
  savings_goal: number
  savings_goal_percent: number
  usd_exchange_rate: number
  salary_payment_day: number
  last_salary_confirmed_at: string | null
}

export interface FamilyFinance extends FinanceStoragePayload {
  source: 'supabase' | 'fallback'
}

export interface UpsertFamilyFinanceInput {
  dailyBudgetBufferMode: 'none' | 'fixed' | 'percent'
  dailyBudgetBufferValue: number
  dailyBudgetCheckinHour: number
  dailyBudgetNudgesEnabled: boolean
  essentialMonthlyCost: number
  monthlyIncome: number
  savingsGoal: number
  savingsGoalPercent: number
  usdExchangeRate: number
  salaryPaymentDay: number
  lastSalaryConfirmedAt: string | null
}

export interface FamilyFinanceInputSnapshot {
  dailyBudgetBufferMode: 'none' | 'fixed' | 'percent'
  dailyBudgetBufferValue: number
  dailyBudgetCheckinHour: number
  dailyBudgetNudgesEnabled: boolean
  essentialMonthlyCost: number
  monthlyIncome: number
  savingsGoal: number
  savingsGoalPercent: number
  usdExchangeRate: number
  salaryPaymentDay: number
  lastSalaryConfirmedAt: string | null
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

export const DEFAULT_USD_EXCHANGE_RATE = 1000
export const DEFAULT_SALARY_PAYMENT_DAY = 1
export const DEFAULT_DAILY_BUDGET_BUFFER_MODE = 'none'
export const DEFAULT_DAILY_BUDGET_CHECKIN_HOUR = 9
export const DEFAULT_SAVINGS_GOAL_PERCENT = 20
export const TARGET_ESSENTIALS_PERCENT = 50
export const MAX_SAVINGS_GOAL_PERCENT = 50

function clampPercent(value: number, max = 100) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(max, Math.max(0, Math.round(value)))
}

export function deriveSavingsGoalPercent({
  monthlyIncome,
  savingsGoal,
}: {
  monthlyIncome: number
  savingsGoal: number
}) {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return DEFAULT_SAVINGS_GOAL_PERCENT
  }

  if (!Number.isFinite(savingsGoal) || savingsGoal <= 0) {
    return 0
  }

  return clampPercent((savingsGoal / monthlyIncome) * 100, MAX_SAVINGS_GOAL_PERCENT)
}

export function deriveSavingsGoalAmount(monthlyIncome: number, savingsGoalPercent: number) {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return 0
  }

  const normalizedPercent = clampPercent(savingsGoalPercent, MAX_SAVINGS_GOAL_PERCENT)
  return Math.round(((monthlyIncome * normalizedPercent) / 100) * 100) / 100
}

export function resolveFlexibleTargetPercent(savingsGoalPercent: number) {
  if (!Number.isFinite(savingsGoalPercent)) {
    return 100 - TARGET_ESSENTIALS_PERCENT
  }

  return Math.max(
    0,
    100 -
      TARGET_ESSENTIALS_PERCENT -
      Math.min(MAX_SAVINGS_GOAL_PERCENT, Math.max(0, savingsGoalPercent)),
  )
}

export function defaultFinanceValues(): FinanceStoragePayload {
  return {
    daily_budget_buffer_mode: DEFAULT_DAILY_BUDGET_BUFFER_MODE,
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: DEFAULT_DAILY_BUDGET_CHECKIN_HOUR,
    daily_budget_nudges_enabled: true,
    essential_monthly_cost: 0,
    monthly_income: 0,
    savings_goal: 0,
    savings_goal_percent: DEFAULT_SAVINGS_GOAL_PERCENT,
    usd_exchange_rate: DEFAULT_USD_EXCHANGE_RATE,
    salary_payment_day: DEFAULT_SALARY_PAYMENT_DAY,
    last_salary_confirmed_at: null,
  }
}

export function normalizeFinancePayload(
  payload?: Partial<FinanceStoragePayload> | null,
): FinanceStoragePayload {
  const base = defaultFinanceValues()
  const monthlyIncome = Number(payload?.monthly_income ?? 0)
  const savingsGoal = Number(payload?.savings_goal ?? 0)
  const essentialMonthlyCost = Number(
    payload?.essential_monthly_cost ?? base.essential_monthly_cost,
  )
  const usdExchangeRate = Number(payload?.usd_exchange_rate ?? base.usd_exchange_rate)
  const salaryPaymentDay = Number(payload?.salary_payment_day ?? base.salary_payment_day)
  const checkinHour = Number(payload?.daily_budget_checkin_hour ?? base.daily_budget_checkin_hour)
  const bufferMode =
    payload?.daily_budget_buffer_mode === 'fixed' || payload?.daily_budget_buffer_mode === 'percent'
      ? payload.daily_budget_buffer_mode
      : base.daily_budget_buffer_mode
  const bufferValue = Number(payload?.daily_budget_buffer_value ?? 0)
  const savingsGoalPercent =
    typeof payload?.savings_goal_percent === 'number'
      ? clampPercent(payload.savings_goal_percent, MAX_SAVINGS_GOAL_PERCENT)
      : deriveSavingsGoalPercent({
          monthlyIncome,
          savingsGoal,
        })

  return {
    daily_budget_buffer_mode: bufferMode,
    daily_budget_buffer_value:
      Number.isFinite(bufferValue) && bufferValue >= 0 ? bufferValue : 0,
    daily_budget_checkin_hour:
      Number.isInteger(checkinHour) && checkinHour >= 0 && checkinHour <= 23
        ? checkinHour
        : base.daily_budget_checkin_hour,
    daily_budget_nudges_enabled: payload?.daily_budget_nudges_enabled !== false,
    essential_monthly_cost:
      Number.isFinite(essentialMonthlyCost) && essentialMonthlyCost >= 0
        ? essentialMonthlyCost
        : base.essential_monthly_cost,
    monthly_income: monthlyIncome,
    savings_goal: deriveSavingsGoalAmount(monthlyIncome, savingsGoalPercent),
    savings_goal_percent: savingsGoalPercent,
    usd_exchange_rate:
      Number.isFinite(usdExchangeRate) && usdExchangeRate > 0
        ? usdExchangeRate
        : base.usd_exchange_rate,
    salary_payment_day:
      Number.isInteger(salaryPaymentDay) && salaryPaymentDay >= 1 && salaryPaymentDay <= 31
        ? salaryPaymentDay
        : base.salary_payment_day,
    last_salary_confirmed_at:
      typeof payload?.last_salary_confirmed_at === 'string' && payload.last_salary_confirmed_at.trim() !== ''
        ? payload.last_salary_confirmed_at
        : null,
  }
}

export function mapFamilyFinanceRecord(
  payload: Partial<FinanceStoragePayload> | null | undefined,
  source: FamilyFinance['source'],
): FamilyFinance {
  return {
    ...normalizeFinancePayload(payload),
    source,
  }
}

export function isMissingColumnError(error: PostgrestError, columnName: string): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return MISSING_COLUMN_CODES.has(code) && text.includes(columnName.toLowerCase())
}

export function isMissingTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const message = error.message?.toLowerCase() ?? ''

  return (
    MISSING_TABLE_CODES.has(code) ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

export function isMissingFinanceColumnError(
  error: PostgrestError,
  columnName:
    | 'essential_monthly_cost'
    | 'usd_exchange_rate'
    | 'salary_payment_day'
    | 'last_salary_confirmed_at'
    | 'daily_budget_buffer_mode'
    | 'daily_budget_buffer_value'
    | 'daily_budget_nudges_enabled'
    | 'daily_budget_checkin_hour'
    | 'savings_goal_percent',
) {
  return isMissingColumnError(error, columnName)
}

export function financeInputToStoragePayload(
  input: UpsertFamilyFinanceInput,
): FinanceStoragePayload {
  return {
    daily_budget_buffer_mode: input.dailyBudgetBufferMode,
    daily_budget_buffer_value: input.dailyBudgetBufferValue,
    daily_budget_checkin_hour: input.dailyBudgetCheckinHour,
    daily_budget_nudges_enabled: input.dailyBudgetNudgesEnabled,
    essential_monthly_cost: input.essentialMonthlyCost,
    monthly_income: input.monthlyIncome,
    savings_goal: deriveSavingsGoalAmount(input.monthlyIncome, input.savingsGoalPercent),
    savings_goal_percent: clampPercent(input.savingsGoalPercent, MAX_SAVINGS_GOAL_PERCENT),
    usd_exchange_rate: input.usdExchangeRate,
    salary_payment_day: input.salaryPaymentDay,
    last_salary_confirmed_at: input.lastSalaryConfirmedAt,
  }
}

export function validateFamilyFinanceInput(input: UpsertFamilyFinanceInput): FinanceStoragePayload {
  if (
    !Number.isFinite(input.monthlyIncome) ||
    !Number.isFinite(input.savingsGoal) ||
    !Number.isFinite(input.savingsGoalPercent) ||
    !Number.isFinite(input.essentialMonthlyCost) ||
    !Number.isFinite(input.usdExchangeRate) ||
    !Number.isFinite(input.dailyBudgetBufferValue) ||
    !Number.isInteger(input.dailyBudgetCheckinHour) ||
    !Number.isInteger(input.salaryPaymentDay) ||
    input.monthlyIncome < 0 ||
    input.savingsGoal < 0 ||
    input.savingsGoalPercent < 0 ||
    input.savingsGoalPercent > MAX_SAVINGS_GOAL_PERCENT ||
    input.essentialMonthlyCost < 0 ||
    input.usdExchangeRate <= 0 ||
    input.dailyBudgetBufferValue < 0 ||
    !['none', 'fixed', 'percent'].includes(input.dailyBudgetBufferMode) ||
    input.dailyBudgetCheckinHour < 0 ||
    input.dailyBudgetCheckinHour > 23 ||
    input.salaryPaymentDay < 1 ||
    input.salaryPaymentDay > 31 ||
    typeof input.dailyBudgetNudgesEnabled !== 'boolean'
  ) {
    throw new Error(
      'Revisa ingreso, ahorro, colchon, nudges, dolar y dia de cobro antes de guardar.',
    )
  }

  if (
    input.lastSalaryConfirmedAt !== null &&
    (typeof input.lastSalaryConfirmedAt !== 'string' ||
      Number.isNaN(new Date(input.lastSalaryConfirmedAt).getTime()))
  ) {
    throw new Error('La fecha de confirmacion de cobro es invalida.')
  }

  return financeInputToStoragePayload(input)
}

export function buildFamilyFinanceInput(
  snapshot: FamilyFinanceInputSnapshot,
): UpsertFamilyFinanceInput {
  return {
    dailyBudgetBufferMode: snapshot.dailyBudgetBufferMode,
    dailyBudgetBufferValue: snapshot.dailyBudgetBufferValue,
    dailyBudgetCheckinHour: snapshot.dailyBudgetCheckinHour,
    dailyBudgetNudgesEnabled: snapshot.dailyBudgetNudgesEnabled,
    essentialMonthlyCost: snapshot.essentialMonthlyCost,
    monthlyIncome: snapshot.monthlyIncome,
    savingsGoal: deriveSavingsGoalAmount(snapshot.monthlyIncome, snapshot.savingsGoalPercent),
    savingsGoalPercent: snapshot.savingsGoalPercent,
    usdExchangeRate: snapshot.usdExchangeRate,
    salaryPaymentDay: snapshot.salaryPaymentDay,
    lastSalaryConfirmedAt: snapshot.lastSalaryConfirmedAt,
  }
}

export function buildSalaryConfirmationInput(
  snapshot: FamilyFinanceInputSnapshot,
  confirmedAt = new Date(),
): UpsertFamilyFinanceInput {
  return buildFamilyFinanceInput({
    ...snapshot,
    lastSalaryConfirmedAt: confirmedAt.toISOString(),
  })
}
