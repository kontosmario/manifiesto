/**
 * Estado del medidor de cupo diario del hero — Home rediseñada (FASE 2 del
 * cableado, plan `design/home-final-2026-07/PLAN-CABLEADO.md` §F2.2).
 *
 * El mockup define 3 estados (README:56 / catálogo §5): holgado ("margen ✓")
 * / al límite / excedido. No existía fuente única: esta derivación PURA los
 * resuelve por el ratio `avgDailySpend / dailyBudget` — los dos números que
 * el hero YA muestra ("Gastás $124k/día" y "$179k POR DÍA"), consistente con
 * la geometría del arco del mockup (fill 124/179 ≈ 69%, metrics-model §4-6).
 *
 * Umbrales (decisión de owner 2026-07-21, fijada — constantes exportadas,
 * ajustables): ok < 0.85 · limit 0.85–1.0 (ambos bordes inclusive) ·
 * over > 1.0.
 *
 * Deliberado (plan §F2.2): NO usa `daily-budget-engine` (`DailyBudgetStatus`)
 * — ese engine mete el buffer de Gastos que el hero NO usa
 * (`cycle-disponible.ts:12-15`) y compara el gasto de HOY, no el promedio.
 *
 * Fuentes de los inputs (metrics-model §4-5):
 *   avgDailySpend = `variableSpentInCurrentCycle / max(1, cycleDay)`
 *                   (`use-home-metrics.ts`, promedio LINEAL — no el robusto)
 *   dailyBudget   = `computeCycleDisponible().dailyBudget`
 *                   (`cycle-disponible.ts:76-91`)
 *
 * El shape de salida calza con `HomeGaugeVM` del kit (`home-screen.tsx:
 * 361-369`: `status: 'ok'|'limit'|'over'` + `fillRatio` 0..1 → dashoffset).
 */

/** Borde inferior del estado "al límite" (inclusive). */
export const GAUGE_LIMIT_THRESHOLD = 0.85
/** Borde superior del estado "al límite" (inclusive); > esto = excedido. */
export const GAUGE_OVER_THRESHOLD = 1.0

export type GaugeStatus = 'ok' | 'limit' | 'over'

export interface GaugeState {
  status: GaugeStatus
  /** `clamp(avgDailySpend / dailyBudget, 0, 1)` — alimenta el dashoffset del
   *  arco (dasharray 163.4). El status usa el ratio SIN clamp. */
  fillRatio: number
}

export interface DeriveGaugeStateInput {
  avgDailySpend: number
  dailyBudget: number
}

/**
 * `null` cuando el medidor no puede/debe mostrarse (`dailyBudget ≤ 0` o
 * datos no finitos) — el hero oculta el bloque completo (medidor + hairline).
 */
export function deriveGaugeState(input: DeriveGaugeStateInput): GaugeState | null {
  const { avgDailySpend, dailyBudget } = input
  if (!Number.isFinite(avgDailySpend) || !Number.isFinite(dailyBudget)) return null
  if (dailyBudget <= 0) return null

  const ratio = avgDailySpend / dailyBudget
  const status: GaugeStatus =
    ratio > GAUGE_OVER_THRESHOLD ? 'over' : ratio >= GAUGE_LIMIT_THRESHOLD ? 'limit' : 'ok'

  return { status, fillRatio: Math.min(1, Math.max(0, ratio)) }
}
