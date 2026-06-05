import { describe, expect, it } from 'vitest'
import { computeMonthCloseSobrante } from '@/utils/month-close-sobrante'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('computeMonthCloseSobrante', () => {
  const lastMonthStart = D(2026, 5, 1)
  const lastMonthEnd = D(2026, 6, 1)

  it('returns positive sobrante when expenses < income', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 1_000_000,
      expenses: [
        { created_at: '2026-05-15T12:00:00Z', price: 300_000 } as any,
        { created_at: '2026-05-20T12:00:00Z', price: 200_000 } as any,
      ],
      savingsContributedThisMonth: 100_000,
    })).toBe(400_000)
  })

  it('clamps to zero when expenses exceed income', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 100_000,
      expenses: [{ created_at: '2026-05-10T12:00:00Z', price: 500_000 } as any],
      savingsContributedThisMonth: 0,
    })).toBe(0)
  })

  it('ignores expenses outside the window', () => {
    expect(computeMonthCloseSobrante({
      lastMonthStart, lastMonthEnd,
      monthlyIncome: 1_000_000,
      expenses: [
        { created_at: '2026-04-30T12:00:00Z', price: 999_999 } as any,
        { created_at: '2026-06-01T12:00:00Z', price: 999_999 } as any,
      ],
      savingsContributedThisMonth: 0,
    })).toBe(1_000_000)
  })
})
