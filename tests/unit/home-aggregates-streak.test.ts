import { describe, it } from 'vitest'

// TODO(phase-1-cleanup): function/export removed during V1 refactor (commits 55840b8/5f0a98b). Re-implement or delete this test.
describe.skip('computeNoExcessStreak', () => {
  it('returns 0 with no expenses', () => {})
  it('counts backward until the first day that exceeds budget', () => {})
  it('returns 0 when today is already over', () => {})
  it('skips empty days as "ok"', () => {})
  it('returns 0 when dailyBudget is null or ≤ 0', () => {})
})
