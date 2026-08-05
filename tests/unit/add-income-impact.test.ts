import { describe, expect, it } from 'vitest'

import {
  classifyCyclePlacement,
  computeAddIncomeImpact,
  isOutsideCurrentCycle,
} from '@/features/income/add-income-impact'
import { computeCycleDisponible } from '@/features/family/cycle-disponible'
import type { CycleDisponibleInputs } from '@/features/family/cycle-disponible'

/** Ciclo con override activo (o modo dinámico): el cupo reparte el
 *  discrecional entre los días restantes ⇒ el ingreso lo mueve. */
const CICLO_CON_OVERRIDE: CycleDisponibleInputs = {
  effectiveCycleIncome: 6_539_107.83,
  effectiveCycleDays: 20,
  commitmentPressure: 1_163_852,
  effectiveSavingsGoal: 0,
  totalAvailable: 3_704_653.81,
  cycleExtraIncome: 0,
  effectiveReservedFixed: 0,
  hasCycleOverride: true,
}

/** Ciclo clásico: el cupo es el objetivo plano libreMes / días totales. */
const CICLO_CLASICO: CycleDisponibleInputs = {
  effectiveCycleIncome: 6_000_000,
  effectiveCycleDays: 30,
  commitmentPressure: 1_200_000,
  effectiveSavingsGoal: 300_000,
  totalAvailable: 4_000_000,
  cycleExtraIncome: 0,
  effectiveReservedFixed: 0,
  hasCycleOverride: false,
}

describe('computeAddIncomeImpact', () => {
  it('el "antes" es exactamente computeCycleDisponible del ciclo vigente', () => {
    const r = computeAddIncomeImpact({ cycle: CICLO_CON_OVERRIDE, amount: 200_000 })
    expect(r.before).toEqual(computeCycleDisponible(CICLO_CON_OVERRIDE))
  })

  it('el ingreso entra por cycleExtraIncome (misma puerta que useHomeMetrics)', () => {
    const r = computeAddIncomeImpact({ cycle: CICLO_CON_OVERRIDE, amount: 200_000 })
    expect(r.after).toEqual(
      computeCycleDisponible({ ...CICLO_CON_OVERRIDE, cycleExtraIncome: 200_000 }),
    )
    // Saldo: 3.704.654 + 200.000. Cupo: 3.904.654 / 20 = 195.233.
    expect(r.before.availableToday).toBe(3_704_654)
    expect(r.after.availableToday).toBe(3_904_654)
    expect(r.availableDelta).toBe(200_000)
    expect(r.after.dailyBudget).toBe(195_233)
    expect(r.dailyBudgetDelta).toBe(10_000)
    expect(r.affectsDailyBudget).toBe(true)
  })

  it('suma sobre ingresos extra ya existentes del ciclo', () => {
    const r = computeAddIncomeImpact({
      cycle: { ...CICLO_CON_OVERRIDE, cycleExtraIncome: 500_000 },
      amount: 100_000,
    })
    expect(r.before.availableToday).toBe(4_204_654)
    expect(r.after.availableToday).toBe(4_304_654)
    expect(r.availableDelta).toBe(100_000)
  })

  it('modo clásico: sube el saldo del mes pero NO el cupo diario', () => {
    // Consecuencia de la fórmula canónica (sin override el cupo sale de
    // income − fijos − ahorro, que ignora los ingresos extra). El paso 2 usa
    // `affectsDailyBudget` para no prometer un cupo que después no aparece.
    const r = computeAddIncomeImpact({ cycle: CICLO_CLASICO, amount: 300_000 })
    expect(r.availableDelta).toBe(300_000)
    expect(r.dailyBudgetDelta).toBe(0)
    expect(r.after.dailyBudget).toBe(r.before.dailyBudget)
    expect(r.affectsDailyBudget).toBe(false)
  })

  it('con fijos PENDIENTES el ingreso suma al saldo y al cupo por separado', () => {
    const cycle: CycleDisponibleInputs = {
      ...CICLO_CON_OVERRIDE,
      effectiveCycleDays: 19,
      totalAvailable: 3_564_994.81,
      effectiveReservedFixed: 682_331,
    }
    const r = computeAddIncomeImpact({ cycle, amount: 380_000 })
    expect(r.before.availableToday).toBe(4_247_326)
    expect(r.after.availableToday).toBe(4_627_326)
    // El cupo reserva los fijos pendientes: (3.564.995 + 380.000) / 19.
    expect(r.after.dailyBudget).toBe(207_631)
  })

  it('monto inválido (0, negativo, NaN) es no-op explícito', () => {
    for (const amount of [0, -50_000, Number.NaN]) {
      const r = computeAddIncomeImpact({ cycle: CICLO_CON_OVERRIDE, amount })
      expect(r.appliedAmount).toBe(0)
      expect(r.availableDelta).toBe(0)
      expect(r.dailyBudgetDelta).toBe(0)
      expect(r.after).toEqual(r.before)
    }
  })

  it('affectsDailyBudget describe el MODO, no el delta', () => {
    // Con monto 0 el delta también es 0; la copy del modo no puede cambiar.
    const r = computeAddIncomeImpact({ cycle: CICLO_CON_OVERRIDE, amount: 0 })
    expect(r.affectsDailyBudget).toBe(true)
  })

  it('no muta el input del ciclo', () => {
    const cycle = { ...CICLO_CON_OVERRIDE }
    computeAddIncomeImpact({ cycle, amount: 999_000 })
    expect(cycle).toEqual(CICLO_CON_OVERRIDE)
  })
})

describe('isOutsideCurrentCycle — ventana semi-abierta [start, end)', () => {
  // Ciclo del 2026-07-31 al 2026-08-30 inclusive ⇒ end EXCLUSIVO 2026-08-31.
  const start = new Date(2026, 6, 31)
  const end = new Date(2026, 7, 31)

  it('primer día del ciclo: ADENTRO (borde inclusivo)', () => {
    expect(classifyCyclePlacement(new Date(2026, 6, 31), start, end)).toBe('inside')
    expect(isOutsideCurrentCycle(new Date(2026, 6, 31), start, end)).toBe(false)
  })

  it('último día del ciclo (end − 1 día): ADENTRO, incluso a las 23:59', () => {
    expect(classifyCyclePlacement(new Date(2026, 7, 30), start, end)).toBe('inside')
    // El gotcha de timestamptz: comparando Date crudos contra un `end` a
    // medianoche, un evento a las 23:30 del último día caía "afuera".
    expect(isOutsideCurrentCycle(new Date(2026, 7, 30, 23, 30), start, end)).toBe(false)
  })

  it('el `end` exacto ya es del ciclo SIGUIENTE (exclusivo)', () => {
    expect(classifyCyclePlacement(new Date(2026, 7, 31), start, end)).toBe('after')
    expect(isOutsideCurrentCycle(new Date(2026, 7, 31), start, end)).toBe(true)
    expect(isOutsideCurrentCycle(new Date(2026, 7, 31, 0, 1), start, end)).toBe(true)
  })

  it('cae en el CICLO ANTERIOR: el día justo antes del start', () => {
    // Back-datear "anteayer" cruzando el cobro: la plata va al ciclo cerrado y
    // el Home no se mueve. Hoy la app es muda; el paso 2 lo avisa con esto.
    expect(classifyCyclePlacement(new Date(2026, 6, 30), start, end)).toBe('before')
    expect(isOutsideCurrentCycle(new Date(2026, 6, 30), start, end)).toBe(true)
    expect(isOutsideCurrentCycle(new Date(2026, 6, 29, 23, 59), start, end)).toBe(true)
  })

  it('un día del medio: adentro', () => {
    expect(isOutsideCurrentCycle(new Date(2026, 7, 4, 12), start, end)).toBe(false)
  })

  it('acepta claves YYYY-MM-DD (lo que guarda income_events.event_date)', () => {
    expect(classifyCyclePlacement('2026-07-31', '2026-07-31', '2026-08-31')).toBe('inside')
    expect(classifyCyclePlacement('2026-08-31', '2026-07-31', '2026-08-31')).toBe('after')
    expect(classifyCyclePlacement('2026-07-30', '2026-07-31', '2026-08-31')).toBe('before')
    // Timestamp completo: se queda con la parte de fecha, no re-parsea a Date
    // (`new Date('YYYY-MM-DD')` UTC-parsea y corre el día en AR).
    expect(classifyCyclePlacement('2026-08-30T23:30:00Z', start, end)).toBe('inside')
  })

  it('mezcla Date y clave sin cambiar el resultado', () => {
    expect(isOutsideCurrentCycle(new Date(2026, 7, 30), '2026-07-31', '2026-08-31')).toBe(
      false,
    )
  })
})
