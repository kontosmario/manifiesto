import { describe, it, expect } from 'vitest'
import { buildDailyAvailableSparkline } from '@/features/home/home-aggregates.model'

describe('buildDailyAvailableSparkline', () => {
  const day = (m: number, d: number) => `2026-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T12:00:00Z`

  it('returns null when no cycle is provided', () => {
    expect(buildDailyAvailableSparkline({ expenses: [], cycleStart: null, totalAvailable: 1000, today: new Date(day(4, 22)) })).toBeNull()
  })

  it('returns one value per elapsed day, each = totalAvailable minus running spend', () => {
    const cycleStart = new Date(day(4, 18))
    const expenses = [
      { price: 100, created_at: day(4, 18) },
      { price: 200, created_at: day(4, 19) },
      { price:  50, created_at: day(4, 20) },
    ]
    const points = buildDailyAvailableSparkline({ expenses, cycleStart, totalAvailable: 1000, today: new Date(day(4, 22)) })
    expect(points).toEqual([900, 700, 650, 650, 650])
  })

  it('downsamples to max 12 points while preserving endpoints', () => {
    const cycleStart = new Date(day(4, 1))
    const expenses = Array.from({ length: 22 }, (_, i) => ({ price: 10, created_at: day(4, i + 1) }))
    const points = buildDailyAvailableSparkline({ expenses, cycleStart, totalAvailable: 1000, today: new Date(day(4, 22)) })
    expect(points!.length).toBe(12)
    expect(points![0]).toBe(990) // after day 1
    expect(points![11]).toBe(780) // after day 22
  })
})
