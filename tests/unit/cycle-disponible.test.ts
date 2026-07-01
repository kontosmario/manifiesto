import { describe, expect, it } from 'vitest'

import { computeCycleDisponible } from '@/features/family/cycle-disponible'

describe('computeCycleDisponible', () => {
  it('override up → cupo consistente con el disponible (discrecional / días restantes)', () => {
    // Familia 61bdc187 al 2026-06-29. El cupo reparte el discrecional (ya neteado
    // de fijos + variable) entre los días restantes: 5.361.171 / 21 = 255.294.
    // Sin fijos pendientes, el saldo real == discrecional.
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83, // override de saldo de ciclo
      effectiveCycleDays: 21, // días restantes (override activo)
      commitmentPressure: 1_162_937, // pressureTotal (no el sum monthly-equiv)
      effectiveSavingsGoal: 0,
      totalAvailable: 5_361_170.83,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: true,
    })
    expect(r.dailyBudget).toBe(255_294)
    expect(r.availableToday).toBe(5_361_171)
    expect(r.rawCycleBalance).toBe(5_361_171)
  })

  it('override up (kontosmario) → cupo 185.233 = discrecional 3.704.654 / 20 días', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83,
      effectiveCycleDays: 20,
      commitmentPressure: 1_163_852,
      effectiveSavingsGoal: 0,
      totalAvailable: 3_704_653.81, // discrecional (reserva todos los fijos)
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: true,
    })
    expect(r.availableToday).toBe(3_704_654)
    expect(r.dailyBudget).toBe(185_233)
    expect(Math.abs(r.dailyBudget * 20 - r.availableToday)).toBeLessThan(20)
  })

  it('override up con fijos PENDIENTES → saldo = discrecional + pendientes; cupo reserva los fijos', () => {
    // kontosmario 2026-07-01: discrecional 3.564.995 (reserva TODOS los fijos),
    // fijos PENDIENTES de pago 682.331. SALDO real = 3.564.995 + 682.331 =
    // 4.247.326 (los pendientes todavía no salieron de la cuenta). El CUPO usa el
    // DISCRECIONAL (reserva los fijos) → 3.564.995 / 19 = 187.631, NO saldo/19.
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83,
      effectiveCycleDays: 19,
      commitmentPressure: 1_163_852,
      effectiveSavingsGoal: 0,
      totalAvailable: 3_564_994.81, // discrecional (reserva paid + reserved)
      cycleExtraIncome: 0,
      effectiveReservedFixed: 682_331, // fijos pendientes de pago
      hasCycleOverride: true,
    })
    expect(r.availableToday).toBe(4_247_326) // saldo real (plata que tenés)
    expect(r.dailyBudget).toBe(187_631) // cupo protegido = discrecional / días
  })

  it('override down (fin de ciclo) → cupo consistente con el discrecional, no 0', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 2_903_500,
      effectiveCycleDays: 6,
      commitmentPressure: 3_061_500,
      effectiveSavingsGoal: 348_420,
      totalAvailable: 1_942_780, // ya incluye la presión prorrateada (down)
      cycleExtraIncome: 1_200_000,
      effectiveReservedFixed: 0,
      hasCycleOverride: true,
    })
    expect(r.dailyBudget).toBe(523_797)
    expect(r.availableToday).toBe(3_142_780)
    expect(r.rawCycleBalance).toBe(3_142_780)
  })

  it('sin override → cupo = libreMes / días totales (objetivo plano, sin restar variable)', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_000_000,
      effectiveCycleDays: 30,
      commitmentPressure: 1_200_000,
      effectiveSavingsGoal: 0,
      totalAvailable: 4_800_000,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(r.dailyBudget).toBe(160_000)
    expect(r.availableToday).toBe(4_800_000)
  })

  it('sin override con fijos pendientes → saldo real suma los pendientes', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_000_000,
      effectiveCycleDays: 30,
      commitmentPressure: 1_200_000, // 300k pagados + 900k pendientes
      effectiveSavingsGoal: 0,
      totalAvailable: 4_800_000, // discrecional (reserva los 1.2M)
      cycleExtraIncome: 0,
      effectiveReservedFixed: 900_000, // fijos pendientes de pago
      hasCycleOverride: false,
    })
    expect(r.availableToday).toBe(5_700_000) // 4.8M + 900k pendientes
    expect(r.dailyBudget).toBe(160_000) // cupo NO cambia (reserva los fijos)
  })

  it('saldo negativo (arriba del plan) → availableToday clamp a 0, rawCycleBalance < 0', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 1_000_000,
      effectiveCycleDays: 10,
      commitmentPressure: 900_000,
      effectiveSavingsGoal: 200_000,
      totalAvailable: -100_000,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(r.dailyBudget).toBe(0) // libreMes clamp a 0
    expect(r.availableToday).toBe(0)
    expect(r.rawCycleBalance).toBe(-100_000)
  })

  it('override con saldo negativo → cupo clamp a 0 (nunca promete plata que no hay)', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 1_000_000,
      effectiveCycleDays: 10,
      commitmentPressure: 900_000,
      effectiveSavingsGoal: 200_000,
      totalAvailable: -100_000,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: true,
    })
    expect(r.dailyBudget).toBe(0) // discrecional clamp a 0 → cupo 0
    expect(r.availableToday).toBe(0)
    expect(r.rawCycleBalance).toBe(-100_000)
  })

  it('income extra del ciclo suma al saldo del mes', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 3_000_000,
      effectiveCycleDays: 30,
      commitmentPressure: 0,
      effectiveSavingsGoal: 0,
      totalAvailable: 100_000,
      cycleExtraIncome: 50_000,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(r.availableToday).toBe(150_000)
    expect(r.rawCycleBalance).toBe(150_000)
  })

  it('días efectivos = 0 no divide por cero (piso de 1)', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 300_000,
      effectiveCycleDays: 0,
      commitmentPressure: 0,
      effectiveSavingsGoal: 0,
      totalAvailable: 300_000,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(r.dailyBudget).toBe(300_000) // 300.000 / max(1, 0)
  })
})
