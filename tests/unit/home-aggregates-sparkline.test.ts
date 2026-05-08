import { describe, it } from 'vitest'

// TODO(phase-1-cleanup): function/export removed during V1 refactor (commits 55840b8/5f0a98b). Re-implement or delete this test.
describe.skip('buildDailyAvailableSparkline', () => {
  it('returns null when no cycle is provided', () => {})
  it('returns one value per elapsed day, each = totalAvailable minus running spend', () => {})
  it('downsamples to max 12 points while preserving endpoints', () => {})
})
