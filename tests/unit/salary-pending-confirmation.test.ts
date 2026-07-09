import { describe, it, expect } from 'vitest'
import { computeIsSalaryPendingConfirmation } from '@/utils/pay-cycle'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

/**
 * `computeIsSalaryPendingConfirmation` es la fuente ÚNICA del flag que
 * congela el ciclo/saldo hasta confirmar el cobro. Semántica real:
 * `true` solo cuando (1) el modo NO es dinámico, (2) el ciclo es monthly,
 * (3) el payday de ESTE mes ya llegó (today >= payDate) y (4) el último
 * confirm es anterior al payday (o no existe / es inválido).
 */

const MONTHLY_DAY_1: FinanceCycleConfig = {
  cycle_type: 'monthly',
  salary_payment_day: 1,
}

// 20 de julio 2026, 15:30 local — bien pasado el payday del día 1.
const TODAY = new Date(2026, 6, 20, 15, 30, 0)

describe('computeIsSalaryPendingConfirmation', () => {
  it('modo dinámico: nunca pending, aunque el payday pasó y no hay confirm', () => {
    expect(
      computeIsSalaryPendingConfirmation(MONTHLY_DAY_1, TODAY, null, 'dynamic'),
    ).toBe(false)
  })

  it('modo fixed: payday pasado + sin confirm → pending', () => {
    expect(
      computeIsSalaryPendingConfirmation(MONTHLY_DAY_1, TODAY, null, 'fixed'),
    ).toBe(true)
  })

  it('incomeMode omitido = default fixed → pending', () => {
    expect(
      computeIsSalaryPendingConfirmation(MONTHLY_DAY_1, TODAY, null),
    ).toBe(true)
  })

  it('cycle_type no-monthly (weekly): no aplica confirm → false', () => {
    const weekly: FinanceCycleConfig = {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-07-01',
      cycle_length_days: 7,
    }
    expect(computeIsSalaryPendingConfirmation(weekly, TODAY, null)).toBe(false)
  })

  it('confirmado DESPUÉS del payday del mes vigente → no pending', () => {
    expect(
      computeIsSalaryPendingConfirmation(
        MONTHLY_DAY_1,
        TODAY,
        '2026-07-05T10:00:00',
      ),
    ).toBe(false)
  })

  it('confirmado el MISMO día del payday cuenta como confirmado (no pending)', () => {
    // La comparación normaliza a start-of-day: confirmed < payDate,
    // no <=. Confirmar el 1 a cualquier hora ya destraba el ciclo.
    expect(
      computeIsSalaryPendingConfirmation(
        MONTHLY_DAY_1,
        TODAY,
        '2026-07-01T00:00:00',
      ),
    ).toBe(false)
  })

  it('confirmado ANTES del inicio del ciclo vigente (mes pasado) → pending', () => {
    expect(
      computeIsSalaryPendingConfirmation(
        MONTHLY_DAY_1,
        TODAY,
        '2026-06-15T09:00:00',
      ),
    ).toBe(true)
  })

  it('hoy ANTES del payday de este mes → nunca pending (aún sin confirm)', () => {
    const day25: FinanceCycleConfig = {
      cycle_type: 'monthly',
      salary_payment_day: 25,
    }
    // Hoy 20 jul, payday el 25 → el cobro todavía no llegó.
    expect(computeIsSalaryPendingConfirmation(day25, TODAY, null)).toBe(false)
  })

  it('lastConfirmedAt inválido (no parseable) se trata como sin confirm → pending', () => {
    expect(
      computeIsSalaryPendingConfirmation(MONTHLY_DAY_1, TODAY, 'not-a-date'),
    ).toBe(true)
  })
})
