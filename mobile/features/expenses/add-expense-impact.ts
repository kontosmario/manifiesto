/**
 * Impacto de un gasto sobre el CUPO DE HOY — el bloque "antes → ahora" del
 * paso 2 del wizard de agregar gasto.
 *
 * Módulo PURO: recibe los números ya calculados y devuelve el shape que
 * consume la card. No conoce hooks, no formatea y no inventa ninguna fórmula
 * de presupuesto.
 *
 * De dónde salen los inputs (importante — acá no se recalcula nada):
 *  · `dailyBudget` = `computeCycleDisponible(...).dailyBudget`, la cuenta
 *    CANÓNICA del cupo diario (la misma que muestra el hero del Home y que
 *    espeja la función SQL `public.cycle_disponible`). El caller la toma de
 *    `useHomeMetrics().hero.dailyBudget`; NO se usa el cupo del
 *    `daily-budget-engine` de la pantalla Gastos, que aplica `buffer` y es
 *    otra superficie con otra cuenta.
 *  · `spentToday` = gasto variable ya registrado en el día destino, y SÓLO
 *    cuando el cupo todavía no lo descontó. OJO, no es siempre: el cupo tiene
 *    dos ramas (ver `computeCycleDisponible`).
 *      – Sin override y en modo clásico el cupo es `(ingreso − fijos − ahorro)
 *        / días TOTALES`: un objetivo plano del día, BRUTO. Ahí hay que
 *        restarle lo ya gastado para saber qué queda.
 *      – Con override de saldo o en modo dinámico el cupo es `discrecional /
 *        días RESTANTES`, y el discrecional sale de `totalAvailable`, que ya
 *        restó `variableSpentInCurrentCycle` — el gasto de hoy INCLUIDO. Ahí
 *        `spentToday` tiene que entrar en 0: restarlo otra vez descuenta dos
 *        veces el mismo gasto y el paso 2 contradice al Home ("te pasás por
 *        $1.000" cuando el Home dice que sobran $7.000).
 *    El caller decide con `hasCycleOverride` (override de saldo O modo
 *    dinámico), el MISMO flag con el que se compone el cupo.
 *  · `incomeConfigured` = `useHomeMetrics().hero.incomeConfigured`.
 *
 * Los porcentajes salen SIN clampear por arriba (pasarse del cupo tiene que
 * poder leerse como "140%"); `ZoneGauge` ya clampea a 0-100 para dibujar la
 * perilla. La zona (sana / media / alta) tampoco se decide acá: los umbrales
 * viven en `zoneForPct` del kit de wizard y duplicarlos los dejaría derivar.
 */

export interface AddExpenseImpactInputs {
  /** Cupo diario canónico del ciclo (`computeCycleDisponible().dailyBudget`). */
  dailyBudget: number
  /** Gasto variable ya registrado en el día destino, antes de este movimiento.
   *  `0` cuando el cupo ya lo descontó (rama `hasCycleOverride`) — ver el
   *  docblock del módulo. */
  spentToday: number
  /** Monto del gasto que se está por cargar (0 mientras no haya monto). */
  amount: number
  /**
   * `false` cuando el hogar todavía no configuró ingreso (ni sueldo ni modo
   * dinámico con eventos). Sin base no hay porcentaje que mostrar: la card
   * tiene que ofrecer el setup, no un "0%" que se lee como "gastaste todo".
   */
  incomeConfigured: boolean
}

export interface AddExpenseImpact {
  /**
   * Hay una base contra la cual medir (ingreso configurado Y cupo > 0).
   * Con `false`, los porcentajes vienen en `null` y `exceeds` en `false`:
   * la card muestra el estado sin-base en vez del bloque comparativo.
   */
  hasBudgetBase: boolean
  /** Cupo libre de hoy ANTES de este gasto (piso 0). */
  budgetBefore: number
  /** Cupo libre DESPUÉS. Puede ser negativo: negativo == te pasás. */
  budgetAfter: number
  /** `budgetAfter` con piso 0 — para la columna "ahora" cuando no se quiere
   *  mostrar un monto en rojo negativo. */
  budgetAfterClamped: number
  /** % del cupo de hoy ya consumido antes de este gasto. `null` sin base. */
  usedPctBefore: number | null
  /** % del cupo de hoy consumido incluyendo este gasto. `null` sin base. */
  usedPctAfter: number | null
  /** Salto en puntos porcentuales. `null` sin base. */
  deltaPct: number | null
  /** El gasto deja el cupo de hoy en negativo. Siempre `false` sin base. */
  exceeds: boolean
  /** Cuánto se pasa del cupo (0 si no se pasa o si no hay base). */
  overBy: number
}

/** Redondeo a entero con -0 normalizado a 0 (`Math.round(-0.2)` es `-0`, que
 *  formatea como "-$0"). */
function round(value: number): number {
  const r = Math.round(value)
  return r === 0 ? 0 : r
}

export function computeAddExpenseImpact(
  inputs: AddExpenseImpactInputs,
): AddExpenseImpact {
  const dailyBudget = Number.isFinite(inputs.dailyBudget)
    ? Math.max(0, inputs.dailyBudget)
    : 0
  const spentToday = Number.isFinite(inputs.spentToday)
    ? Math.max(0, inputs.spentToday)
    : 0
  const amount = Number.isFinite(inputs.amount) ? Math.max(0, inputs.amount) : 0

  const hasBudgetBase = inputs.incomeConfigured && dailyBudget > 0

  const budgetBefore = round(Math.max(0, dailyBudget - spentToday))
  const budgetAfterRaw = dailyBudget - spentToday - amount
  const budgetAfter = round(budgetAfterRaw)

  if (!hasBudgetBase) {
    return {
      hasBudgetBase: false,
      budgetBefore,
      budgetAfter,
      budgetAfterClamped: Math.max(0, budgetAfter),
      usedPctBefore: null,
      usedPctAfter: null,
      deltaPct: null,
      // Sin base, "te pasaste del cupo" no significa nada: el cupo es 0
      // porque no hay plan cargado, no porque el usuario haya gastado de más.
      exceeds: false,
      overBy: 0,
    }
  }

  const usedPctBefore = round((spentToday / dailyBudget) * 100)
  const usedPctAfter = round(((spentToday + amount) / dailyBudget) * 100)

  return {
    hasBudgetBase: true,
    budgetBefore,
    budgetAfter,
    budgetAfterClamped: Math.max(0, budgetAfter),
    usedPctBefore,
    usedPctAfter,
    // El delta se calcula sobre los porcentajes YA redondeados, no sobre los
    // crudos: si la card muestra "30% → 45%" y el delta viniera de los crudos
    // podía imprimir "+16pp" al lado, contradiciendo a los dos números que
    // tiene pegados.
    deltaPct: usedPctAfter - usedPctBefore,
    exceeds: budgetAfter < 0,
    overBy: budgetAfter < 0 ? -budgetAfter : 0,
  }
}
