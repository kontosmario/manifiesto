/**
 * Paso 2 del alta de ingreso: qué le pasa al ciclo si guardo esto. Módulo PURO
 * (sin React, sin RN) → corre en el env 'node' de vitest.
 *
 * NO recalcula el disponible: reusa `computeCycleDisponible`, la cuenta
 * canónica que ya comparten el hero del Home, la card de Control y la función
 * SQL `public.cycle_disponible`. Un ingreso entra al ciclo por
 * `cycleExtraIncome` (así lo alimenta `useHomeMetrics` con la suma de
 * `income_events`), por eso el "después" es el MISMO input con ese único campo
 * incrementado: cualquier otra forma de sumarlo divergería del número que el
 * usuario ve al volver al Home.
 *
 * Consecuencia honesta de la fórmula canónica: sin override (modo clásico) el
 * cupo diario sale de `income − fijos − ahorro`, que no incluye los ingresos
 * extra ⇒ el ingreso sube el SALDO del mes pero NO el cupo del día. Con
 * override / modo dinámico el cupo reparte el discrecional entre los días
 * restantes y sí se mueve. `affectsDailyBudget` expone esa diferencia para que
 * el paso 2 no prometa un cupo que después no aparece.
 */
import {
  computeCycleDisponible,
  type CycleDisponible,
  type CycleDisponibleInputs,
} from '@/features/family/cycle-disponible'
import { formatLocalDateKey } from '@/utils/pay-cycle'

export interface AddIncomeImpactInputs {
  /** Intermedios del ciclo VIGENTE, tal cual los arma `useHomeMetrics`. */
  cycle: CycleDisponibleInputs
  /** Monto del ingreso a guardar. `NaN`/≤0 se tratan como 0 (no-op). */
  amount: number
}

export interface AddIncomeImpact {
  /** Disponible + cupo del ciclo tal como está hoy. */
  before: CycleDisponible
  /** …y como quedarían al guardar el ingreso. */
  after: CycleDisponible
  /** Monto efectivamente aplicado (0 si el input era inválido). */
  appliedAmount: number
  /** `after.availableToday − before.availableToday`. */
  availableDelta: number
  /** `after.dailyBudget − before.dailyBudget` (0 en modo clásico). */
  dailyBudgetDelta: number
  /**
   * `false` cuando la fórmula canónica no mueve el cupo con ingresos extra
   * (modo clásico sin override). El paso 2 muestra sólo el saldo en ese caso.
   */
  affectsDailyBudget: boolean
}

export function computeAddIncomeImpact({
  cycle,
  amount,
}: AddIncomeImpactInputs): AddIncomeImpact {
  const appliedAmount = Number.isFinite(amount) && amount > 0 ? amount : 0
  const before = computeCycleDisponible(cycle)
  const after = computeCycleDisponible({
    ...cycle,
    cycleExtraIncome: cycle.cycleExtraIncome + appliedAmount,
  })
  const dailyBudgetDelta = after.dailyBudget - before.dailyBudget
  return {
    before,
    after,
    appliedAmount,
    availableDelta: after.availableToday - before.availableToday,
    dailyBudgetDelta,
    // Se decide por la fórmula, no por el delta: con `appliedAmount` 0 el delta
    // también es 0 y la copy tiene que seguir diciendo la verdad del modo.
    affectsDailyBudget: cycle.hasCycleOverride,
  }
}

/** Dónde cae el ingreso respecto del ciclo vigente. */
export type CyclePlacement = 'before' | 'inside' | 'after'

/** Fecha como `Date` local o como clave/ISO `YYYY-MM-DD…` (lo que trae la DB). */
export type DayLike = Date | string

/**
 * Clave de día LOCAL. El proyecto tiene el gotcha de timestamptz: comparar
 * `Date` crudos (o construir `new Date('YYYY-MM-DD')`, que UTC-parsea) corre el
 * día en AR (UTC-3) y un ingreso del último día del ciclo cae "afuera". Las
 * claves `YYYY-MM-DD` además ordenan lexicográficamente = cronológicamente.
 */
function toDayKey(value: DayLike): string {
  return typeof value === 'string' ? value.slice(0, 10) : formatLocalDateKey(value)
}

/**
 * OJO: la ventana del ciclo es SEMI-ABIERTA `[cycleStart, cycleEnd)` —
 * `getCurrentPayCycle` calcula `end = start + días` y la query de ingresos del
 * ciclo filtra `.gte(start).lt(end)`. Es decir: el primer día del ciclo está
 * ADENTRO y `cycleEnd` ya es el primer día del ciclo SIGUIENTE. Tratarlo como
 * inclusivo haría que el aviso mienta justo en el borde.
 */
export function classifyCyclePlacement(
  eventDate: DayLike,
  cycleStart: DayLike,
  cycleEnd: DayLike,
): CyclePlacement {
  const key = toDayKey(eventDate)
  if (key < toDayKey(cycleStart)) return 'before'
  if (key >= toDayKey(cycleEnd)) return 'after'
  return 'inside'
}

/**
 * `true` cuando el ingreso NO pertenece al ciclo vigente y por lo tanto la
 * plata no va a aparecer en el saldo de esta pantalla. Hoy la app es MUDA en
 * ese caso: back-datear a "anteayer" cruzando el cobro guarda el ingreso en el
 * ciclo cerrado y el Home no se mueve, sin ninguna explicación. El paso 2 lo
 * avisa con esto.
 */
export function isOutsideCurrentCycle(
  eventDate: DayLike,
  cycleStart: DayLike,
  cycleEnd: DayLike,
): boolean {
  return classifyCyclePlacement(eventDate, cycleStart, cycleEnd) !== 'inside'
}
