/**
 * Fórmula canónica del sobrante decidible de un cierre de mes.
 *
 * Spec (2026-06-05-month-close-leftover-decision-design.md):
 *   sobrante = ingreso − gastos del mes − ahorro comprometido
 *
 * En columnas de `monthly_summaries`:
 *   sobrante = monthly_income − total_spent − savings_goal_amount
 *
 * Auditoría 2026-06-11: los dos call-sites (hook del sheet standalone
 * y armado del wrapped en home-dashboard) restaban `savings_delta`,
 * pero el server define `savings_delta = max(0, income − total_spent)`
 * — o sea, EL SOBRANTE MISMO. La doble resta daba 0 idéntico para
 * cualquier familia, así que la decisión de sobrante nunca se disparó
 * (caso real: $1.727.195 de Abril 2026 sin decisión registrada). El
 * campo correcto es `savings_goal_amount`: la meta de ahorro ya
 * comprometida del mes, que no es plata "a decidir".
 */

/** Mínimo para considerar que hay algo que decidir. */
export const SOBRANTE_THRESHOLD = 1000

export interface SobranteSummaryFields {
  monthly_income?: number | string | null
  total_spent?: number | string | null
  savings_goal_amount?: number | string | null
}

export function computeSobranteFromSummary(s: SobranteSummaryFields): number {
  return Math.max(
    0,
    Number(s.monthly_income ?? 0)
      - Number(s.total_spent ?? 0)
      - Number(s.savings_goal_amount ?? 0),
  )
}
