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
  /**
   * `true` cuando el saldo del ciclo proviene de un override (saldo
   * reportado "a hoy", p.ej. ajuste de saldo / reserva sumada al mes).
   * Cambia cómo se reparte el cupo diario — ver `computeCycleDisponible`.
   */
  hasCycleOverride: boolean
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
    hasCycleOverride,
  } = inputs

  // Saldo del mes — espeja totalAvailable + income extra del hook.
  const rawCycleBalance = Math.round(totalAvailable + cycleExtraIncome)
  const availableToday = Math.max(0, rawCycleBalance)

  // Cupo diario ("para gustos hoy").
  // · CON override: el saldo del mes es "a hoy" (ya neteado de fijos,
  //   ahorro y variable-desde-confirmación). El cupo reparte lo que
  //   REALMENTE queda entre los días restantes → cupo × días_restantes =
  //   saldo del mes. Antes usaba el numerador BRUTO (ingreso − fijos)
  //   sin restar el variable ya gastado, y dividía por días restantes,
  //   así que re-ofrecía como disponible plata ya consumida e inflaba el
  //   cupo (bug 2026-06-30). Ahora es consistente con el saldo por
  //   construcción — nunca promete más de lo que hay.
  // · SIN override: objetivo plano del mes (libreMes / días totales), el
  //   comportamiento canónico histórico. No resta variable ya gastado
  //   (es un target por día, no un saldo restante); se deja intacto.
  const dailyBudget = hasCycleOverride
    ? Math.max(0, Math.round(availableToday / Math.max(1, effectiveCycleDays)))
    : Math.max(
        0,
        Math.round(
          Math.max(
            0,
            Math.round(effectiveCycleIncome - commitmentPressure - effectiveSavingsGoal),
          ) / Math.max(1, effectiveCycleDays),
        ),
      )

  return { dailyBudget, availableToday, rawCycleBalance }
}
