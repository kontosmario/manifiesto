import { useMemo } from 'react'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  computeMonthlyAccountingWindow,
  type MonthlyAccountingWindow,
} from '@/utils/monthly-accounting'
import {
  computeIsSalaryPendingConfirmation,
  normalizeToStartOfDay,
} from '@/utils/pay-cycle'

export type { MonthlyAccountingWindow } from '@/utils/monthly-accounting'

/**
 * Single source of truth para la ventana de accounting mensual.
 * Wrapper minimal de `computeMonthlyAccountingWindow` con cycle
 * config resuelto de la query de family_finance.
 *
 * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
 */
export function useMonthlyAccounting(
  familyId?: string,
  options?: { freeze?: boolean },
): MonthlyAccountingWindow {
  // freeze=true (default) → plano PLATA: la ventana de accounting se
  // congela en el ciclo anterior mientras el cobro está pendiente, así el
  // saldo no salta al ingreso nuevo. freeze=false → plano OBLIGACIONES: la
  // ventana avanza en tiempo real (lo usa la clasificación de fijos para
  // que vencidos/pendientes reflejen el calendario real). Ver el modelo de
  // dos planos en use-fijos-controller.
  const freeze = options?.freeze ?? true
  const finance = useFamilyFinance(familyId)
  // Hoisteado fuera del memo (el compiler no preserva la memo con el
  // optional-chain adentro). El "modo dinámico → nunca freeze" vive en
  // computeIsSalaryPendingConfirmation (fuente única).
  const incomeMode = finance.data?.income_mode
  return useMemo(() => {
    const today = normalizeToStartOfDay(new Date())
    const config = financeToCycleConfig(finance.data)
    // Freeze: si el cobro del mes no fue confirmado, la ventana (y por ende el
    // saldo) se queda en el ciclo anterior. Sin esto el saldo saltaba al ingreso
    // nuevo el día de cobro aunque el user no confirmara.
    const pending = computeIsSalaryPendingConfirmation(
      config,
      today,
      finance.data?.last_salary_confirmed_at ?? null,
      incomeMode,
    )
    // Dinámico: la ventana de accounting SIGUE el ciclo elegido
    // (semana/quincena); los sueldos fijos rolling siguen en mes
    // calendario (ver computeMonthlyAccountingWindow).
    return computeMonthlyAccountingWindow(
      config,
      today,
      freeze && pending,
      incomeMode === 'dynamic',
    )
  }, [
    finance.data?.cycle_type,
    finance.data?.salary_payment_day,
    finance.data?.cycle_anchor_date,
    finance.data?.cycle_length_days,
    finance.data?.last_salary_confirmed_at,
    incomeMode,
    freeze,
  ])
}
