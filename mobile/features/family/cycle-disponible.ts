/**
 * Cálculo canónico del disponible del ciclo — la MISMA cuenta que ve el
 * usuario en el hero del Home (`use-home-metrics`) y que debe mostrar el
 * push "Buen día" (`checkin_morning`).
 *
 * Toma los intermedios YA derivados por `family-dashboard-model` (que es la
 * única fuente de la lógica de override/proration/gasto-desde-hoy) y produce
 * los dos números de cara al usuario. La función SQL `public.cycle_disponible`
 * espeja esta cuenta 1:1; el parity test (`tests/integration/
 * cycle-disponible-parity.test.ts`) verifica que no derive.
 *
 * Decisión deliberada: NO aplica `buffer` — el hero del Home tampoco lo hace
 * (`use-home-metrics.ts`). El buffer vive solo en el daily-budget-engine de la
 * pantalla Gastos, otra superficie.
 */

export interface CycleDisponibleInputs {
  /** Ingreso efectivo del ciclo (override de saldo si aplica, sino sueldo). */
  effectiveCycleIncome: number
  /** Días sobre los que se prorratea el cupo (restantes con override, sino totales). */
  effectiveCycleDays: number
  /** Presión de fijos del ciclo CRUDA (`pressureTotal`), sin prorratear. */
  commitmentPressure: number
  /** Meta de ahorro efectiva del ciclo (recalculada al cobro real si override down). */
  effectiveSavingsGoal: number
  /** Saldo discrecional del ciclo ANTES de sumar income extra (del dashboard). */
  totalAvailable: number
  /** Ingresos extra del ciclo (transferencias/bonos/regalos). */
  cycleExtraIncome: number
}

export interface CycleDisponible {
  /** "Hoy tenés ~$X para gustos" — cupo diario. */
  dailyBudget: number
  /** "Quedan $Y del mes" — saldo del mes (clamp a 0). */
  availableToday: number
  /** Saldo del mes SIN clamp — `< 0` ⇒ "arriba del plan". */
  rawCycleBalance: number
}

export function computeCycleDisponible(inputs: CycleDisponibleInputs): CycleDisponible {
  const {
    effectiveCycleIncome,
    effectiveCycleDays,
    commitmentPressure,
    effectiveSavingsGoal,
    totalAvailable,
    cycleExtraIncome,
  } = inputs

  // Cupo diario — espeja use-home-metrics.ts (libreMes / días efectivos).
  const libreMes = Math.max(
    0,
    Math.round(effectiveCycleIncome - commitmentPressure - effectiveSavingsGoal),
  )
  const dailyBudget = Math.max(0, Math.round(libreMes / Math.max(1, effectiveCycleDays)))

  // Saldo del mes — espeja totalAvailable + income extra del hook.
  const rawCycleBalance = Math.round(totalAvailable + cycleExtraIncome)
  const availableToday = Math.max(0, rawCycleBalance)

  return { dailyBudget, availableToday, rawCycleBalance }
}
