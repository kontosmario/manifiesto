import { describe, it, expect } from 'vitest'
import { computeNoExcessStreak } from '@/features/home/home-aggregates.model'

describe('computeNoExcessStreak', () => {
  const day = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns 0 with no expenses', () => {
    expect(computeNoExcessStreak({ expenses: [], dailyBudget: 1000, today: new Date(day(22)) })).toBe(0)
  })

  it('counts backward until the first day that exceeds budget', () => {
    const expenses = [
      { price: 400, created_at: day(22) },
      { price: 600, created_at: day(22) }, // today = exactly at budget (ok)
      { price: 500, created_at: day(21) }, // ok
      { price: 1500, created_at: day(20) }, // exceeded
      { price: 200, created_at: day(19) }, // ok (but stops)
    ]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(2)
  })

  it('returns 0 when today is already over', () => {
    const expenses = [{ price: 1200, created_at: day(22) }]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(0)
  })

  it('skips empty days as "ok"', () => {
    const expenses = [
      { price: 800, created_at: day(22) },
      // day 21 no expenses → counts as ok
      { price: 1100, created_at: day(20) },
    ]
    expect(computeNoExcessStreak({ expenses, dailyBudget: 1000, today: new Date(day(22)) })).toBe(2)
  })

  it('returns 0 when dailyBudget is null or ≤ 0', () => {
    expect(computeNoExcessStreak({ expenses: [], dailyBudget: null, today: new Date(day(22)) })).toBe(0)
    expect(computeNoExcessStreak({ expenses: [{ price: 1, created_at: day(22) }], dailyBudget: 0, today: new Date(day(22)) })).toBe(0)
  })
})
