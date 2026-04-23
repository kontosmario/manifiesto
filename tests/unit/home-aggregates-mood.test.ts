import { describe, it, expect } from 'vitest'
import { computeMonthDailyMood } from '@/features/home/home-aggregates.model'

describe('computeMonthDailyMood', () => {
  const d = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('returns empty map with null budget', () => {
    expect(computeMonthDailyMood({ expenses: [], dailyBudget: null, today: new Date(d(22)) })).toEqual({})
  })

  it('tags green ≤ budget, amber ≤ 1.2× budget, red > 1.2× budget', () => {
    const expenses = [
      { price: 800,  created_at: d(1) },   // green
      { price: 1000, created_at: d(2) },   // green
      { price: 1100, created_at: d(3) },   // amber
      { price: 1200, created_at: d(4) },   // amber
      { price: 1201, created_at: d(5) },   // red
      { price: 3000, created_at: d(6) },   // red
    ]
    const mood = computeMonthDailyMood({ expenses, dailyBudget: 1000, today: new Date(d(22)) })
    expect(mood[1]).toBe('green')
    expect(mood[2]).toBe('green')
    expect(mood[3]).toBe('amber')
    expect(mood[4]).toBe('amber')
    expect(mood[5]).toBe('red')
    expect(mood[6]).toBe('red')
  })

  it('does not tag days beyond today', () => {
    const mood = computeMonthDailyMood({ expenses: [], dailyBudget: 1000, today: new Date(d(10)) })
    expect(mood[11]).toBeUndefined()
  })

  it('only considers the current calendar month of `today`', () => {
    const expenses = [{ price: 100, created_at: '2026-03-30T12:00:00Z' }]
    const mood = computeMonthDailyMood({ expenses, dailyBudget: 1000, today: new Date(d(1)) })
    expect(Object.keys(mood)).toEqual([])
  })
})
