import { describe, it, expect } from 'vitest'
import { buildHeroStatsTrio } from '@/features/home/home-aggregates.model'

describe('buildHeroStatsTrio', () => {
  const day = (n: number) => `2026-04-${String(n).padStart(2,'0')}T12:00:00Z`

  it('builds today/spent-today/piggy with positive piggy', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: 100000,
      totalAvailable: 500000,
      daysElapsed: 4,          // 4 days elapsed incl. today
      expenses: [
        { price: 12400, created_at: day(22) }, // today
        { price: 50000, created_at: day(21) },
        { price: 30000, created_at: day(20) },
      ],
      today: new Date(day(22)),
    })
    expect(result.todayRemaining).toBe(87600)      // 100k - 12.4k
    expect(result.spentToday).toBe(12400)
    expect(result.movementsToday).toBe(1)
    // Concrete expectation: piggy = (daysElapsed-1)*dailyBudget - spentBeforeToday + todayRemaining
    // = 3*100000 - (50000+30000) + 87600
    // = 300000 - 80000 + 87600 = 307600
    expect(result.piggy).toBe(307600)
    expect(result.piggyState).toBe('saved')
  })

  it('returns null trio when dailyBudget is null', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: null,
      totalAvailable: 0,
      daysElapsed: 0,
      expenses: [],
      today: new Date(day(22)),
    })
    expect(result.todayRemaining).toBeNull()
    expect(result.piggy).toBeNull()
    expect(result.piggyState).toBe('unknown')
  })

  it('reports "excedido" when piggy is negative', () => {
    const result = buildHeroStatsTrio({
      dailyBudget: 100,
      totalAvailable: 1000,
      daysElapsed: 2,
      expenses: [
        { price: 500, created_at: day(22) },
      ],
      today: new Date(day(22)),
    })
    // piggy = (2-1)*100 - 0 + (100-500) = 100 - 400 = -300
    expect(result.piggy).toBe(-300)
    expect(result.piggyState).toBe('excess')
  })
})
