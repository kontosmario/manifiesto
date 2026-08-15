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

/** Piso nominal del umbral de decisión. No consumir directo para gatear:
 *  usar `sobranteThreshold(income)` — este piso solo protege hogares con
 *  ingreso 0/desconocido. */
export const SOBRANTE_THRESHOLD = 1000

/**
 * Umbral ÚNICO de "hay algo que decidir" — y, desde el rediseño del
 * wrapped (La Edición), también la banda del veredicto JUSTO:
 *
 *   saldo >  umbral  → MARGEN  (pantalla 06 = destino del sobrante)
 *   saldo <  0       → EXCEDIDO (pantalla 06 = plan de recuperación)
 *   0 ≤ saldo ≤ umbral → JUSTO (la 06 se salta; se persiste 'skip')
 *
 * Relativo con piso: `max($1.000, 0,5% del ingreso del ciclo)`. Un nominal
 * fijo se desactualiza con la inflación y no se corrige sin release; el
 * 0,5% mantiene la banda proporcional al hogar. DEBE ser el mismo número
 * que gatea el sheet standalone de decisión y el pending del wrapped —
 * si divergen, un cierre dentro de la banda dice "nada que decidir" en
 * una superficie y pregunta en la otra (antes pasaba: tres literales
 * `1000` esparcidos).
 *
 * `income` = ingreso REAL del ciclo (monthly_income + extra_income), el
 * mismo agregado que usa la fórmula del sobrante.
 */
export function sobranteThreshold(income: number): number {
  const base = Number.isFinite(income) ? Math.max(0, income) : 0
  return Math.max(SOBRANTE_THRESHOLD, Math.round(base * 0.005))
}

/** Ingreso real del ciclo para `sobranteThreshold` desde un summary row. */
export function cycleIncomeFromSummary(s: SobranteSummaryFields): number {
  return Number(s.monthly_income ?? 0) + Number(s.extra_income ?? 0)
}

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
