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
  /** Saldo DISCRECIONAL del ciclo (reserva TODOS los fijos) ANTES de sumar income
   *  extra (del dashboard). De acá sale el CUPO diario protegido. */
  totalAvailable: number
  /** Ingresos extra del ciclo (transferencias/bonos/regalos). */
  cycleExtraIncome: number
  /** Fijos PENDIENTES de pago del ciclo (prorrateados). El SALDO real los suma de
   *  vuelta al discrecional (solo resta los fijos pagados); el cupo no. */
  effectiveReservedFixed: number
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
    effectiveReservedFixed,
    hasCycleOverride,
  } = inputs

  // Base DISCRECIONAL del ciclo (reserva TODOS los fijos: pagados + pendientes).
  const discretionary = totalAvailable + cycleExtraIncome
  // Saldo del mes = plata REAL: el discrecional + los fijos PENDIENTES de pago
  // (todavía no salieron de la cuenta; el saldo solo resta los fijos pagados +
  // el variable). Baja a medida que se paga cada fijo. Modelo owner 2026-07-01.
  const rawCycleBalance = Math.round(discretionary + effectiveReservedFixed)
  const availableToday = Math.max(0, rawCycleBalance)

  // Cupo diario ("para gustos hoy") — usa la base DISCRECIONAL (que reserva los
  // fijos pendientes), NO el saldo real, para no dejar gastar la plata de los
  // fijos que todavía faltan pagar.
  // · CON override: reparte el discrecional entre los días RESTANTES.
  // · SIN override: objetivo plano del mes (libreMes / días totales), histórico.
  const dailyBudget = hasCycleOverride
    ? Math.max(
        0,
        Math.round(
          Math.max(0, Math.round(discretionary)) / Math.max(1, effectiveCycleDays),
        ),
      )
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
