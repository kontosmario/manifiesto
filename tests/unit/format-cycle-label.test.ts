import { describe, expect, it } from 'vitest'
import { formatCycleLabel, formatCycleSummary } from '@/utils/format-cycle-label'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('formatCycleLabel', () => {
  it('monthly: "20 may → 19 jun"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 6, 20), days: 31, weeks: 5 },
      'monthly',
    )
    // end es exclusive — el label muestra el último día inclusive (end - 1d)
    expect(result).toBe('20 may → 19 jun')
  })

  it('biweekly: "20 may → 2 jun · quincena"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 6, 3), days: 14, weeks: 2 },
      'biweekly',
    )
    expect(result).toBe('20 may → 2 jun · quincena')
  })

  it('weekly: "20 may → 26 may · semana"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 5, 27), days: 7, weeks: 1 },
      'weekly',
    )
    expect(result).toBe('20 may → 26 may · semana')
  })

  it('custom: "20 may → 29 may · cada 10 días"', () => {
    const result = formatCycleLabel(
      { start: D(2026, 5, 20), end: D(2026, 5, 30), days: 10, weeks: 2 },
      'custom',
    )
    expect(result).toBe('20 may → 29 may · cada 10 días')
  })
})

describe('formatCycleSummary', () => {
  it('monthly · día 20', () => {
    expect(formatCycleSummary({ cycle_type: 'monthly', salary_payment_day: 20 }))
      .toBe('Mensual · día 20')
  })
  it('biweekly summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'biweekly', cycle_anchor_date: '2026-06-06', cycle_length_days: 14,
    })).toBe('Quincenal · desde 6 jun')
  })
  it('weekly summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'weekly', cycle_anchor_date: '2026-06-04', cycle_length_days: 7,
    })).toBe('Semanal · desde jue 4 jun')
  })
  it('custom summary', () => {
    expect(formatCycleSummary({
      cycle_type: 'custom', cycle_anchor_date: '2026-05-15', cycle_length_days: 10,
    })).toBe('Custom · cada 10 días')
  })
})
