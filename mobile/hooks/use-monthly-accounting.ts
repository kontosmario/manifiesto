import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  computeMonthlyAccountingWindow,
  type MonthlyAccountingWindow,
} from '@/utils/monthly-accounting'
import { normalizeToStartOfDay } from '@/utils/pay-cycle'

export type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'

/**
 * Single source of truth para la ventana de accounting mensual.
 * Wrapper minimal de `computeMonthlyAccountingWindow` con cycle
 * config resuelto de la query de family_finance.
 *
 * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
 */
export function useMonthlyAccounting(familyId?: string): MonthlyAccountingWindow {
  const finance = useFamilyFinance(familyId)
  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const config = financeToCycleConfig(finance.data)
    return computeMonthlyAccountingWindow(config, today)
  }, [
    finance.data?.cycle_type,
    finance.data?.salary_payment_day,
    finance.data?.cycle_anchor_date,
    finance.data?.cycle_length_days,
  ])
}
