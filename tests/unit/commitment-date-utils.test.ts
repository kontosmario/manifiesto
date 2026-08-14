import { describe, it, expect } from 'vitest'
import { advanceFixedExpenseDueDate } from '@/features/fixed-expenses/commitment-date-utils'

describe('advanceFixedExpenseDueDate — paridad con el SQL', () => {
  it('weekly suma 7 días e ignora day_of_month', () => {
    expect(advanceFixedExpenseDueDate('2026-06-10', 'weekly', 31)).toBe('2026-06-17')
  })
  it('biweekly suma 14 días e ignora day_of_month', () => {
    expect(advanceFixedExpenseDueDate('2026-06-25', 'biweekly', 1)).toBe('2026-07-09')
  })
  it('monthly re-ancla al day_of_month clampado (31 → feb 28)', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
  })
  it('monthly recupera el ancla al salir del mes corto (feb 28 → mar 31)', () => {
    expect(advanceFixedExpenseDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
  })
  it('monthly con año bisiesto (ene 31 2028 → feb 29)', () => {
    expect(advanceFixedExpenseDueDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29')
  })
  it('quarterly salta 3 meses y clampa (ene 31 → abr 30)', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'quarterly', 31)).toBe('2026-04-30')
  })
  it('semiannual salta 6 meses', () => {
    expect(advanceFixedExpenseDueDate('2026-01-15', 'semiannual', 15)).toBe('2026-07-15')
  })
  it('annual salta 12 meses y clampa (feb 29 2028 → feb 28 2029)', () => {
    expect(advanceFixedExpenseDueDate('2028-02-29', 'annual', 29)).toBe('2029-02-28')
  })
  it('sin day_of_month conserva el día base clampado', () => {
    expect(advanceFixedExpenseDueDate('2026-01-31', 'monthly', null)).toBe('2026-02-28')
    expect(advanceFixedExpenseDueDate('2026-01-15', 'monthly')).toBe('2026-02-15')
  })
})
