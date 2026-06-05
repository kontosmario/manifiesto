import type { FamilyFinance } from '@/features/finance/family-finance.model'

/**
 * Discriminated union que describe el ciclo activo de una familia.
 * Hay dos regímenes internos:
 *   - 'monthly': anclado a un día-del-mes (lógica AR clásica).
 *   - 'biweekly' | 'weekly' | 'custom': rolling N días desde un anchor.
 *
 * Lo consumen `getCurrentPayCycle` y `formatCycleLabel`.
 */
export type FinanceCycleConfig =
  | { cycle_type: 'monthly'; salary_payment_day: number }
  | { cycle_type: 'biweekly'; cycle_anchor_date: string; cycle_length_days: 14 }
  | { cycle_type: 'weekly'; cycle_anchor_date: string; cycle_length_days: 7 }
  | { cycle_type: 'custom'; cycle_anchor_date: string; cycle_length_days: number }

/**
 * Proyecta el row de `family_finance` al config tipado. Aplica defensas:
 *   - finance null/undefined → monthly + day 1
 *   - cycle_type rolling pero anchor missing → fallback a monthly (estado
 *     corrupto que no debería pasar, pero no queremos crashear el hook).
 */
export function financeToCycleConfig(
  finance: Pick<
    FamilyFinance,
    'cycle_type' | 'salary_payment_day' | 'cycle_anchor_date' | 'cycle_length_days'
  > | null | undefined,
): FinanceCycleConfig {
  if (!finance) {
    return { cycle_type: 'monthly', salary_payment_day: 1 }
  }
  if (finance.cycle_type === 'monthly') {
    return {
      cycle_type: 'monthly',
      salary_payment_day: finance.salary_payment_day ?? 1,
    }
  }
  if (!finance.cycle_anchor_date || !finance.cycle_length_days) {
    return {
      cycle_type: 'monthly',
      salary_payment_day: finance.salary_payment_day ?? 1,
    }
  }
  if (finance.cycle_type === 'biweekly') {
    return {
      cycle_type: 'biweekly',
      cycle_anchor_date: finance.cycle_anchor_date,
      cycle_length_days: 14,
    }
  }
  if (finance.cycle_type === 'weekly') {
    return {
      cycle_type: 'weekly',
      cycle_anchor_date: finance.cycle_anchor_date,
      cycle_length_days: 7,
    }
  }
  return {
    cycle_type: 'custom',
    cycle_anchor_date: finance.cycle_anchor_date,
    cycle_length_days: finance.cycle_length_days,
  }
}
