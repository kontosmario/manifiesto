import { describe, expect, it } from 'vitest'
import { periodOf, periodsBetween } from '@/features/subscriptions-zombie/period'

describe('periodOf', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(periodOf(new Date('2026-05-02T15:00:00Z'))).toBe('2026-05')
    expect(periodOf(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12')
    expect(periodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('periodsBetween', () => {
  it('counts months inclusive', () => {
    expect(periodsBetween('2026-01', '2026-01')).toBe(0)
    expect(periodsBetween('2026-01', '2026-02')).toBe(1)
    expect(periodsBetween('2026-01', '2027-01')).toBe(12)
    expect(periodsBetween('2026-12', '2027-01')).toBe(1)
  })
})
