import { describe, expect, it } from 'vitest'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('monthly accounting window — monthly cycle (matches payCycle)', () => {
  it('matches the pay cycle for monthly user day 20, today=jun 5', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'monthly', salary_payment_day: 20 },
      D(2026, 6, 5),
    )
    expect(w.start).toEqual(D(2026, 5, 20))
    expect(w.end).toEqual(D(2026, 6, 20))
    expect(w.days).toBe(31)
    expect(w.daysIntoMonth).toBe(17)
    expect(w.daysRemaining).toBe(15)
  })
})

describe('monthly accounting window — non-monthly cycle (calendar month)', () => {
  it('biweekly: calendar month jun 1 → jul 1', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'biweekly', cycle_anchor_date: '2026-05-23', cycle_length_days: 14 },
      D(2026, 6, 5),
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
    expect(w.days).toBe(30)
    expect(w.daysIntoMonth).toBe(5)
    expect(w.daysRemaining).toBe(26)
  })

  it('weekly: today is day 1 of month', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-05-30', cycle_length_days: 7 },
      D(2026, 6, 1),
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
    expect(w.daysIntoMonth).toBe(1)
    expect(w.daysRemaining).toBe(30)
  })

  it('custom: today is last day of month (jul 31)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'custom', cycle_anchor_date: '2026-06-01', cycle_length_days: 10 },
      D(2026, 7, 31),
    )
    expect(w.start).toEqual(D(2026, 7, 1))
    expect(w.end).toEqual(D(2026, 8, 1))
    expect(w.daysIntoMonth).toBe(31)
    expect(w.daysRemaining).toBe(1)
  })

  it('handles february (28 days, non-leap)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-02-06', cycle_length_days: 7 },
      D(2026, 2, 15),
    )
    expect(w.days).toBe(28)
  })
})

describe('monthly accounting window — INGRESO DINÁMICO sigue el ciclo (followCycleWindow)', () => {
  it('semanal: la ventana ES la semana rolling (anchor 2026-06-01, hoy jun 5)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-06-01', cycle_length_days: 7 },
      D(2026, 6, 5),
      false,
      true, // followCycleWindow (dinámico)
    )
    expect(w.start).toEqual(D(2026, 6, 1)) // lunes de la semana en curso
    expect(w.end).toEqual(D(2026, 6, 8))
    expect(w.days).toBe(7)
    expect(w.daysIntoMonth).toBe(5) // día 5 del ciclo
    expect(w.daysRemaining).toBe(3)
  })

  it('quincenal: ventana de 14 días desde el anchor', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'biweekly', cycle_anchor_date: '2026-06-01', cycle_length_days: 14 },
      D(2026, 6, 20),
      false,
      true,
    )
    // 20 jun cae en el segundo período (15 jun → 29 jun).
    expect(w.start).toEqual(D(2026, 6, 15))
    expect(w.end).toEqual(D(2026, 6, 29))
    expect(w.days).toBe(14)
  })

  it('mensual dinámico (día 1): igual al mes calendario', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'monthly', salary_payment_day: 1 },
      D(2026, 6, 5),
      false,
      true,
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
  })

  it('REGRESIÓN: sin el flag, weekly sigue en mes calendario (sueldos fijos rolling)', () => {
    const w = computeMonthlyAccountingWindow(
      { cycle_type: 'weekly', cycle_anchor_date: '2026-06-01', cycle_length_days: 7 },
      D(2026, 6, 5),
      false,
      false,
    )
    expect(w.start).toEqual(D(2026, 6, 1))
    expect(w.end).toEqual(D(2026, 7, 1))
    expect(w.days).toBe(30)
  })
})
