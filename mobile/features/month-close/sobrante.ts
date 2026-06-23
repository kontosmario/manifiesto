/**
 * Fórmula canónica del sobrante decidible de un cierre de mes.
 *
 * Spec (2026-06-05-month-close-leftover-decision-design.md):
 *   sobrante = ingreso del ciclo − gastos del mes − ahorro comprometido
 *
 * En columnas de `monthly_summaries`:
 *   sobrante = (monthly_income + extra_income) − total_spent − savings_goal_amount
 *
 * `monthly_income` es SOLO el sueldo base; `extra_income` es la suma de los
 * `income_events` del ciclo (arrastres de un "acumular" previo, bonos,
 * transferencias) — income REAL del ciclo que el resto del app ya suma
 * (Home/Control). Fix 2026-06-22: sin `extra_income`, un ciclo donde
 * sueldo + arrastre > gastos daba sobrante 0 ("empatado") y la decisión del
 * Wrapped no se ofrecía. Caso real: Mayo 2026 = 6.4M + 1.727M arrastre −
 * 7.99M gasto = +130k (antes daba 0).
 *
 * Auditoría 2026-06-11: NO restar `savings_delta` (= max(0, income − spent), el
 * sobrante mismo); el campo correcto es `savings_goal_amount` (ahorro
 * comprometido, no plata a decidir).
 */

/** Mínimo para considerar que hay algo que decidir. */
export const SOBRANTE_THRESHOLD = 1000

export interface SobranteSummaryFields {
  monthly_income?: number | string | null
  /** Suma de income_events del ciclo (arrastres/bonos/transferencias). */
  extra_income?: number | string | null
  total_spent?: number | string | null
  savings_goal_amount?: number | string | null
}

/** Sobrante decidible, clampeado a >= 0 (gateado por SOBRANTE_THRESHOLD). */
export function computeSobranteFromSummary(s: SobranteSummaryFields): number {
  return Math.max(0, computeCycleSurplusSigned(s))
}

/**
 * Saldo del ciclo CON signo (no clampeado) = lo que queda en la cuenta al
 * cierre. Para el display de Ediciones (margen / excedido / empatado), donde
 * un mes excedido debe mostrarse negativo en vez de aparecer "empatado".
 */
export function computeCycleSurplusSigned(s: SobranteSummaryFields): number {
  return (
    Number(s.monthly_income ?? 0)
    + Number(s.extra_income ?? 0)
    - Number(s.total_spent ?? 0)
    - Number(s.savings_goal_amount ?? 0)
  )
}
