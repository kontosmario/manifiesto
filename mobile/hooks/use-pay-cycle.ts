import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { DEFAULT_SALARY_PAYMENT_DAY } from '@/features/finance/family-finance.model'
import {
  computeIsSalaryPendingConfirmation,
  getCurrentPayCycle,
  normalizeToStartOfDay,
  type PayCycle,
} from '@/utils/pay-cycle'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'

export interface UsePayCycleResult {
  /** Cycle window: [start, end). */
  cycle: PayCycle
  /** Day-of-month the user gets paid on (1–31). Solo significativo en monthly;
   *  en rolling devolvemos el valor crudo de `family_finance` (o el default)
   *  para compat con call-sites que aún no migraron. */
  salaryPaymentDay: number
  /** Today, normalized to start-of-day (local tz). */
  today: Date
  /**
   * True when today is already past the salary payday but the user has
   * not yet confirmed receipt — mirrors the freeze behavior from
   * family-dashboard-model.ts so Home, Gastos y Fijos agree.
   * Solo aplica al regimen 'monthly'; en rolling siempre `false`.
   */
  isSalaryPendingConfirmation: boolean
}

/**
 * Single source of truth for the pay-cycle window across the app.
 * Reads `family_finance.cycle_*` + `salary_payment_day` y despacha
 * al regimen correcto via `financeToCycleConfig`.
 */
export function usePayCycle(familyId?: string): UsePayCycleResult {
  const financeQuery = useFamilyFinance(familyId)
  const finance = financeQuery.data

  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const config = financeToCycleConfig(finance)
    const salaryPaymentDay =
      config.cycle_type === 'monthly'
        ? config.salary_payment_day
        : (finance?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY)

    // freezeUntilSalaryConfirmation solo aplica a monthly: para rolling
    // types el ciclo activo viene del anchor + length, no del "día de
    // cobro" que se confirma manualmente. Helper compartido con
    // useMonthlyAccounting → countdown y saldo nunca divergen.
    const isSalaryPendingConfirmation = computeIsSalaryPendingConfirmation(
      config,
      today,
      finance?.last_salary_confirmed_at ?? null,
    )

    const cycle = getCurrentPayCycle(today, config, isSalaryPendingConfirmation)
    return { cycle, salaryPaymentDay, today, isSalaryPendingConfirmation }
  }, [
    finance?.cycle_type,
    finance?.salary_payment_day,
    finance?.cycle_anchor_date,
    finance?.cycle_length_days,
    finance?.last_salary_confirmed_at,
  ])
}
