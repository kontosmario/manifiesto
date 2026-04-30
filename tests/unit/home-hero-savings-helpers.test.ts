import { describe, expect, it } from 'vitest'
import { computeSavingsHeroChip } from '@/components/home/home-hero-savings-helpers'

const baseArgs = {
  savingsGoal: 500_000,
  savingsRemaining: 500_000,
  savingsGoalPercent: 20,
  incomeConfigured: true,
}

describe('computeSavingsHeroChip', () => {
  it('returns null when income is not configured', () => {
    expect(
      computeSavingsHeroChip({ ...baseArgs, incomeConfigured: false }),
    ).toBeNull()
  })

  it('returns null when savings goal is 0 (not configured)', () => {
    expect(computeSavingsHeroChip({ ...baseArgs, savingsGoal: 0 })).toBeNull()
  })

  it('returns null when savings goal is negative (defensive)', () => {
    expect(computeSavingsHeroChip({ ...baseArgs, savingsGoal: -10 })).toBeNull()
  })

  it('builds a healthy chip when remaining >= target', () => {
    const out = computeSavingsHeroChip(baseArgs)
    expect(out?.kind).toBe('healthy')
    expect(out?.label).toMatch(/Apartando/)
    expect(out?.label).toMatch(/20%/)
  })

  it('omits the percent suffix when savingsGoalPercent is 0', () => {
    const out = computeSavingsHeroChip({ ...baseArgs, savingsGoalPercent: 0 })
    expect(out?.label).not.toMatch(/%/)
  })

  it('builds a partial chip when some of the buffer was consumed', () => {
    const out = computeSavingsHeroChip({
      ...baseArgs,
      savingsRemaining: 320_000,
    })
    expect(out?.kind).toBe('partial')
    expect(out?.label).toMatch(/de/)
  })

  it('builds a consumed chip when remaining hits 0', () => {
    const out = computeSavingsHeroChip({ ...baseArgs, savingsRemaining: 0 })
    expect(out?.kind).toBe('consumed')
    expect(out?.label).toMatch(/Te comiste el ahorro/)
  })

  it('clamps remaining > target to healthy (defensive)', () => {
    const out = computeSavingsHeroChip({
      ...baseArgs,
      savingsRemaining: 999_999_999,
    })
    expect(out?.kind).toBe('healthy')
  })

  it('clamps negative remaining to consumed (defensive)', () => {
    const out = computeSavingsHeroChip({ ...baseArgs, savingsRemaining: -100 })
    expect(out?.kind).toBe('consumed')
  })

  it('rounds fractional inputs', () => {
    const out = computeSavingsHeroChip({
      ...baseArgs,
      savingsGoal: 500_000.4,
      savingsRemaining: 320_000.7,
      savingsGoalPercent: 19.6,
    })
    expect(out?.kind).toBe('partial')
    expect(out?.label).toMatch(/20%/)
  })
})
