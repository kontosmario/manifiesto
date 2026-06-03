import { describe, expect, it } from 'vitest'
import {
  computeCycleFromBounds,
  computeFallbackCycle,
} from '../../mobile/features/import-review/cycle-context'

describe('computeCycleFromBounds', () => {
  it('returns the bounded cycle when both start and end are valid ISOs', () => {
    const result = computeCycleFromBounds('2026-05-20', '2026-06-19')
    expect(result.cycleStart.getFullYear()).toBe(2026)
    expect(result.cycleStart.getMonth()).toBe(4) // May (0-indexed)
    expect(result.cycleStart.getDate()).toBe(20)
    expect(result.cycleDays).toBe(31) // May 20 → Jun 19 inclusive = 31 days
  })

  it('handles a same-month cycle', () => {
    const result = computeCycleFromBounds('2026-02-01', '2026-02-28')
    expect(result.cycleDays).toBe(28)
  })

  it('returns null when start is missing', () => {
    expect(computeCycleFromBounds(null, '2026-06-19')).toBeNull()
  })

  it('returns null when end is missing', () => {
    expect(computeCycleFromBounds('2026-05-20', null)).toBeNull()
  })

  it('returns null when start is after end', () => {
    expect(computeCycleFromBounds('2026-06-20', '2026-06-10')).toBeNull()
  })
})

describe('computeFallbackCycle', () => {
  it('returns a 31-day cycle starting at the first of the current month', () => {
    const today = new Date(2026, 5, 15) // June 15, 2026
    const result = computeFallbackCycle(today)
    expect(result.cycleStart.getFullYear()).toBe(2026)
    expect(result.cycleStart.getMonth()).toBe(5) // June
    expect(result.cycleStart.getDate()).toBe(1)
    expect(result.cycleDays).toBe(31)
  })
})
