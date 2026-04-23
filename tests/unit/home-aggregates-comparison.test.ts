import { describe, it, expect } from 'vitest'
import { computeMonthlyComparison } from '@/features/home/home-aggregates.model'

describe('computeMonthlyComparison', () => {
  const apr = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`
  const mar = (n: number) => `2026-03-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns null deltas when either side is empty', () => {
    const r = computeMonthlyComparison({
      expenses: [{ price: 100, created_at: apr(5) }],
      today: new Date(apr(22)),
    })
    expect(r.previousMonthTotal).toBe(0)
    expect(r.deltaPercent).toBeNull()
    expect(r.deltaAmount).toBeNull()
  })

  it('computes a positive delta when current > previous', () => {
    const r = computeMonthlyComparison({
      expenses: [
        { price: 1500, created_at: apr(1) },
        { price: 1500, created_at: apr(2) },  // current = 3000
        { price: 1000, created_at: mar(1) },
        { price: 1500, created_at: mar(5) },  // prev = 2500
      ],
      today: new Date(apr(22)),
    })
    expect(r.currentMonthTotal).toBe(3000)
    expect(r.previousMonthTotal).toBe(2500)
    expect(r.deltaAmount).toBe(500)
    expect(r.deltaPercent).toBeCloseTo(20, 1)
    expect(r.direction).toBe('up')
  })

  it('handles negative delta + "down"', () => {
    const r = computeMonthlyComparison({
      expenses: [
        { price: 1000, created_at: apr(2) },
        { price: 2000, created_at: mar(1) },
      ],
      today: new Date(apr(22)),
    })
    expect(r.deltaPercent).toBeCloseTo(-50, 1)
    expect(r.direction).toBe('down')
  })
})
