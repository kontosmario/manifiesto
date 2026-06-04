import { describe, expect, it } from 'vitest'
import { getCurrentPayCycle } from '@/utils/pay-cycle'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('getCurrentPayCycle — monthly', () => {
  it('after payday → current month is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 5, 20))
    expect(cycle.end).toEqual(D(2026, 6, 20))
    expect(cycle.days).toBe(31)
  })

  it('before payday → previous month is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 15), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 5, 20))
  })

  it('today is payday → today is start', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 20), {
      cycle_type: 'monthly',
      salary_payment_day: 20,
    })
    expect(cycle.start).toEqual(D(2026, 6, 20))
  })
})

describe('getCurrentPayCycle — biweekly', () => {
  it('today = anchor → active cycle starts today', () => {
    const cycle = getCurrentPayCycle(D(2026, 5, 23), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 5, 23))
    expect(cycle.end).toEqual(D(2026, 6, 6))
    expect(cycle.days).toBe(14)
  })

  it('12 days post-anchor → first cycle still active', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 5, 23))
    expect(cycle.end).toEqual(D(2026, 6, 6))
  })

  it('14 days post-anchor → second cycle starts', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 6), {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
    })
    expect(cycle.start).toEqual(D(2026, 6, 6))
  })
})

describe('getCurrentPayCycle — weekly', () => {
  it('basic: today = anchor + 3 days', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-06-01',
      cycle_length_days: 7,
    })
    expect(cycle.start).toEqual(D(2026, 6, 1))
    expect(cycle.end).toEqual(D(2026, 6, 8))
    expect(cycle.days).toBe(7)
  })

  it('anchor in the future → returns the PRECEDING cycle (period_index negative)', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-06-12',
      cycle_length_days: 7,
    })
    // diff = -8, period_index = floor(-8/7) = floor(-1.14) = -2.
    // start = anchor + -2*7 days = jun 12 - 14 days = may 29.
    expect(cycle.start).toEqual(D(2026, 5, 29))
    expect(cycle.end).toEqual(D(2026, 6, 5))
  })
})

describe('getCurrentPayCycle — custom', () => {
  it('N=10, today = 20 days post-anchor → second cycle', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'custom',
      cycle_anchor_date: '2026-05-15',
      cycle_length_days: 10,
    })
    // diff=20, period_index=2, start = may 15 + 20 days = jun 4
    expect(cycle.start).toEqual(D(2026, 6, 4))
    expect(cycle.end).toEqual(D(2026, 6, 14))
    expect(cycle.days).toBe(10)
  })

  it('N=1 (daily) — today is its own cycle', () => {
    const cycle = getCurrentPayCycle(D(2026, 6, 4), {
      cycle_type: 'custom',
      cycle_anchor_date: '2026-06-01',
      cycle_length_days: 1,
    })
    expect(cycle.start).toEqual(D(2026, 6, 4))
    expect(cycle.end).toEqual(D(2026, 6, 5))
  })
})
