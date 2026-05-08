import { describe, it } from 'vitest'

// TODO(phase-1-cleanup): function/export removed during V1 refactor (commits 55840b8/5f0a98b). Re-implement or delete this test.
describe.skip('computeMonthDailyMood', () => {
  it('returns empty map with null budget', () => {})
  it('tags green ≤ budget, amber ≤ 1.2× budget, red > 1.2× budget', () => {})
  it('does not tag days beyond today', () => {})
  it('only considers the current calendar month of `today`', () => {})
})
