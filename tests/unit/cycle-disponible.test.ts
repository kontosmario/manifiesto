import { describe, expect, it } from 'vitest'

import { computeCycleDisponible } from '@/features/family/cycle-disponible'

describe('computeCycleDisponible', () => {
  it('override up → cupo consistente con el saldo (saldo / días restantes)', () => {
    // Familia 61bdc187 al 2026-06-29. Antes el cupo usaba el numerador BRUTO
    // (ingreso − fijos) SIN restar el variable ya gastado → 256.008 inflado.
    // Ahora reparte el saldo del mes (ya neteado de fijos + variable) entre
    // los días restantes: 5.361.171 / 21 = 255.294, con cupo × días ≈ saldo.
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83, // override de saldo de ciclo
      effectiveCycleDays: 21, // días restantes (override activo)
      commitmentPressure: 1_162_937, // pressureTotal (no el sum monthly-equiv)
      effectiveSavingsGoal: 0,
      totalAvailable: 5_361_170.83,
      cycleExtraIncome: 0,
      hasCycleOverride: true,
    })
    expect(r.dailyBudget).toBe(255_294)
    expect(r.availableToday).toBe(5_361_171)
    expect(r.rawCycleBalance).toBe(5_361_171)
  })

  it('override up (kontosmario 2026-06-30) → cupo 185.233 = saldo 3.704.654 / 20 días', () => {
    // El caso que motivó el fix: el cupo mostraba 268.763 (saldo bruto
    // 5.375.256 / 20) re-ofreciendo el 1,67M de variable ya gastado. Ahora
    // = saldo del mes / días restantes → 185.233, consistente por
    // construcción (nunca promete más de lo que queda).
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83,
      effectiveCycleDays: 20,
      commitmentPressure: 1_163_852,
      effectiveSavingsGoal: 0,
      totalAvailable: 3_704_653.81, // ya resta fijos + variable-desde-confirmación
      cycleExtraIncome: 0,
      hasCycleOverride: true,
    })
    expect(r.availableToday).toBe(3_704_654)
    expect(r.dailyBudget).toBe(185_233)
    // Invariante: cupo × días restantes ≈ saldo del mes (nunca lo supera).
    expect(Math.abs(r.dailyBudget * 20 - r.availableToday)).toBeLessThan(20)
  })

  it('override down (fin de ciclo) → cupo consistente con el saldo, no 0', () => {
    // Familia 3d7f2031: cobró 2.9M sobre un sueldo de 8M, 6 días de ciclo,
    // fijos pendientes altos pero prorrateados (down) + 1.2M de income extra
    // → saldo 3.142.780. El cupo ahora espeja ese saldo (3.142.780 / 6 =
    // 523.797) en vez del viejo 0, que salía de usar la presión CRUDA (sin
    // prorratear) en el numerador — inconsistente con el saldo que SÍ
    // prorratea. cupo × días ≈ saldo.
    const r = computeCycleDisponible({
      effectiveCycleIncome: 2_903_500,
      effectiveCycleDays: 6,
      commitmentPressure: 3_061_500,
      effectiveSavingsGoal: 348_420,
      totalAvailable: 1_942_780, // ya incluye la presión prorrateada (down)
      cycleExtraIncome: 1_200_000,
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
      hasCycleOverride: false,
    })
    expect(r.dailyBudget).toBe(160_000)
    expect(r.availableToday).toBe(4_800_000)
  })

  it('saldo negativo (arriba del plan) → availableToday clamp a 0, rawCycleBalance < 0', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 1_000_000,
      effectiveCycleDays: 10,
      commitmentPressure: 900_000,
      effectiveSavingsGoal: 200_000,
      totalAvailable: -100_000,
      cycleExtraIncome: 0,
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
      hasCycleOverride: true,
    })
    expect(r.dailyBudget).toBe(0) // availableToday clamp a 0 → cupo 0
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
      hasCycleOverride: false,
    })
    expect(r.dailyBudget).toBe(300_000) // 300.000 / max(1, 0)
  })
})
