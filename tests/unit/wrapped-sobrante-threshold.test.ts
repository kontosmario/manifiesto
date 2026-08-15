import { describe, it, expect } from 'vitest'
import {
  cycleIncomeFromSummary,
  sobranteThreshold,
  SOBRANTE_THRESHOLD,
} from '@/features/month-close/sobrante'

/**
 * Umbral relativo unificado (plan La Edición §6.3): el MISMO número gatea
 * el sheet standalone, el pending del wrapped y la banda JUSTO del
 * veredicto — `max($1.000, 0,5% del ingreso del ciclo)`.
 */
describe('sobranteThreshold', () => {
  it('piso nominal para ingresos chicos o desconocidos', () => {
    expect(sobranteThreshold(0)).toBe(SOBRANTE_THRESHOLD)
    expect(sobranteThreshold(100_000)).toBe(SOBRANTE_THRESHOLD)
    expect(sobranteThreshold(Number.NaN)).toBe(SOBRANTE_THRESHOLD)
    expect(sobranteThreshold(-5)).toBe(SOBRANTE_THRESHOLD)
  })

  it('0,5% del ingreso cuando supera el piso', () => {
    expect(sobranteThreshold(1_000_000)).toBe(5_000)
    expect(sobranteThreshold(3_333_537)).toBe(16_668)
  })

  it('el ingreso del ciclo suma sueldo base + extra_income', () => {
    expect(
      cycleIncomeFromSummary({ monthly_income: 6_400_000, extra_income: 1_727_195 }),
    ).toBe(8_127_195)
    expect(cycleIncomeFromSummary({})).toBe(0)
  })
})
