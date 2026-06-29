import { describe, expect, it } from 'vitest'

import { computeCycleDisponible } from '@/features/family/cycle-disponible'

describe('computeCycleDisponible', () => {
  it('caso real owner (override up) → reproduce el cupo de 256.008 que ve la app', () => {
    // Datos reales de la familia 61bdc187 al 2026-06-29 (verificados con el
    // prototipo SQL read-only contra prod). El usuario reportó "256k aprox".
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_539_107.83, // override de saldo de ciclo
      effectiveCycleDays: 21, // días restantes (override activo)
      commitmentPressure: 1_162_937, // pressureTotal (no el sum monthly-equiv)
      effectiveSavingsGoal: 0,
      totalAvailable: 5_361_170.83,
      cycleExtraIncome: 0,
    })
    expect(r.dailyBudget).toBe(256_008)
    expect(r.availableToday).toBe(5_361_171)
    expect(r.rawCycleBalance).toBe(5_361_171)
  })

  it('caso real kenility (override down, fin de ciclo) → cupo 0, saldo 3.142.780', () => {
    // Familia 3d7f2031: cobró 2.9M sobre un sueldo de 8M, 6 días de ciclo,
    // fijos pendientes > saldo → cupo diario colapsa a 0 (el push viejo
    // gritaba 204.617).
    const r = computeCycleDisponible({
      effectiveCycleIncome: 2_903_500,
      effectiveCycleDays: 6,
      commitmentPressure: 3_061_500,
      effectiveSavingsGoal: 348_420,
      totalAvailable: 1_942_780, // ya incluye la presión prorrateada (down)
      cycleExtraIncome: 1_200_000,
    })
    expect(r.dailyBudget).toBe(0)
    expect(r.availableToday).toBe(3_142_780)
    expect(r.rawCycleBalance).toBe(3_142_780)
  })

  it('sin override → cupo = libreMes / días totales', () => {
    const r = computeCycleDisponible({
      effectiveCycleIncome: 6_000_000,
      effectiveCycleDays: 30,
      commitmentPressure: 1_200_000,
      effectiveSavingsGoal: 0,
      totalAvailable: 4_800_000,
      cycleExtraIncome: 0,
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
    })
    expect(r.dailyBudget).toBe(0) // libreMes clamp a 0
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
    })
    expect(r.dailyBudget).toBe(300_000) // 300.000 / max(1, 0)
  })
})
