import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { DEFAULT_SALARY_PAYMENT_DAY } from '@/features/finance/family-finance.model'
import {
  buildPayDate,
  getCurrentPayCycle,
  normalizeToStartOfDay,
  type PayCycle,
} from '@/utils/pay-cycle'

export interface UsePayCycleResult {
  /** Cycle window: [start, end). */
  cycle: PayCycle
  /** Day-of-month the user gets paid on (1–31). */
  salaryPaymentDay: number
  /** Today, normalized to start-of-day (local tz). */
  today: Date
  /**
   * True when today is already past the salary payday but the user has
   * not yet confirmed receipt — mirrors the freeze behavior from
   * family-dashboard-model.ts so Home, Gastos and Fijos agree.
   */
  isSalaryPendingConfirmation: boolean
}

/**
 * Single source of truth for the pay-cycle window across the app.
 * Wraps `getCurrentPayCycle` with `family_finance.salary_payment_day`
 * already resolved from the cached snapshot.
 */
export function usePayCycle(familyId?: string): UsePayCycleResult {
  const financeQuery = useFamilyFinance(familyId)
  const finance = financeQuery.data

  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const salaryPaymentDay = finance?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY
    const currentMonthPayDate = buildPayDate(
      today.getFullYear(),
      today.getMonth(),
      salaryPaymentDay,
    )
    const lastConfirmed = parseConfirmedDate(finance?.last_salary_confirmed_at ?? null)
    const isSalaryPendingConfirmation =
      today >= currentMonthPayDate &&
      (!lastConfirmed || lastConfirmed < currentMonthPayDate)
    const cycle = getCurrentPayCycle(today, salaryPaymentDay, isSalaryPendingConfirmation)
    return { cycle, salaryPaymentDay, today, isSalaryPendingConfirmation }
  }, [finance?.salary_payment_day, finance?.last_salary_confirmed_at])
}

function parseConfirmedDate(raw: string | null): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return normalizeToStartOfDay(parsed)
}
