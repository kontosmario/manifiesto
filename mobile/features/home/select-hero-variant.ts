/**
 * Selector de la VARIANTE del hero del Home.
 *
 * Vivía inline como un ternario anidado en `neo-home-screen.tsx`. Se extrae al
 * sumar la variante `'over'` (saldo negativo) porque la precedencia entre los
 * cuatro estados es una regla de producto, no un detalle de render — y porque
 * un ternario de cuatro ramas dentro del cuerpo de la pantalla no se puede
 * testear en el borde (0 vs −1) sin montar el árbol entero.
 *
 * PRECEDENCIA (de más a menos urgente):
 *
 *   empty    → no hay ingreso configurado: no hay saldo que mostrar todavía.
 *   over     → el saldo del ciclo es NEGATIVO: el hogar se pasó del plan.
 *   adjusted → el usuario reportó un saldo menor al sueldo recurrente.
 *   steady   → el estado normal.
 *
 * `over` gana sobre `adjusted` a propósito: haberse pasado es información más
 * urgente que la razón por la que el presupuesto era distinto este ciclo.
 */

import type { HomeHeroVariant } from '@/components/redesign/home/home-screen'

export interface HeroVariantInputs {
  /** `family_finance.monthly_income > 0` (o modo dinámico). */
  incomeConfigured: boolean
  isDynamicIncome: boolean
  /** Dinámico recién configurado, sin ningún ingreso cargado aún. */
  dynamicSetup: boolean
  /**
   * Saldo del ciclo SIN clampear (`CycleDisponible.rawCycleBalance`). El hero
   * es el ÚNICO consumidor del valor crudo; el resto del app sigue leyendo
   * `availableToday`, que está clampeado a 0.
   */
  rawCycleBalance: number
  /**
   * `hero.balanceHydrating`: algún insumo del saldo sigue en su primera
   * carga. Mientras sea `true` la rama 'over' NO puede ganar: en el primer
   * paint el saldo se computa sin el income extra del ciclo (esa query no
   * tiene seed en el snapshot) y da un negativo transitorio — el hero
   * arrancaba ROJO y pasaba a verde ~300ms después (flash reportado por el
   * owner 2026-08-13). El estado real recién se refleja al asentarse el monto.
   */
  balanceHydrating: boolean
  cycleAdjusted: boolean
  cycleBalanceDiff: number
}

export function selectHeroVariant(inputs: HeroVariantInputs): HomeHeroVariant {
  const {
    incomeConfigured,
    isDynamicIncome,
    dynamicSetup,
    rawCycleBalance,
    balanceHydrating,
    cycleAdjusted,
    cycleBalanceDiff,
  } = inputs

  if ((!isDynamicIncome && !incomeConfigured) || dynamicSetup) return 'empty'
  // Estrictamente menor: un saldo de exactamente 0 es "justo", no "pasado".
  // Y solo con el saldo ASENTADO: durante la hidratación un negativo es
  // artefacto (falta el income extra del ciclo), no diagnóstico.
  if (rawCycleBalance < 0 && !balanceHydrating) return 'over'
  if (cycleAdjusted && cycleBalanceDiff <= 0) return 'adjusted'
  return 'steady'
}
