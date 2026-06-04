import { describe, expect, it } from 'vitest'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'

describe('financeToCycleConfig', () => {
  it('returns monthly for legacy finance row (no cycle_type)', () => {
    const result = financeToCycleConfig({
      cycle_type: 'monthly',
      salary_payment_day: 20,
      cycle_anchor_date: null,
      cycle_length_days: null,
    } as any)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 20 })
  })

  it('returns biweekly with anchor + 14', () => {
    const result = financeToCycleConfig({
      cycle_type: 'biweekly',
      salary_payment_day: 1,
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    } as any)
    expect(result).toEqual({
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
  })

  it('falls back to monthly + day 1 when finance is null', () => {
    const result = financeToCycleConfig(null)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 1 })
  })

  it('forces monthly when type is biweekly but anchor missing (defensive)', () => {
    const result = financeToCycleConfig({
      cycle_type: 'biweekly',
      salary_payment_day: 15,
      cycle_anchor_date: null,
      cycle_length_days: 14,
    } as any)
    expect(result).toEqual({ cycle_type: 'monthly', salary_payment_day: 15 })
  })
})
