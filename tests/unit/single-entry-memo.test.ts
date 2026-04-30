import { describe, expect, it, vi } from 'vitest'
import { singleEntryMemoize } from '@/lib/single-entry-memo'

describe('singleEntryMemoize', () => {
  it('returns the cached result when called with identical args', () => {
    const compute = vi.fn((a: number, b: number) => a + b)
    const memoized = singleEntryMemoize(compute)
    expect(memoized(1, 2)).toBe(3)
    expect(memoized(1, 2)).toBe(3)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('recomputes when args differ', () => {
    const compute = vi.fn((a: number, b: number) => a + b)
    const memoized = singleEntryMemoize(compute)
    expect(memoized(1, 2)).toBe(3)
    expect(memoized(1, 3)).toBe(4)
    expect(memoized(1, 2)).toBe(3)
    expect(compute).toHaveBeenCalledTimes(3)
  })

  it('uses Object.is for arg comparison (NaN === NaN cached)', () => {
    const compute = vi.fn((n: number) => n * 2)
    const memoized = singleEntryMemoize(compute)
    expect(Number.isNaN(memoized(Number.NaN))).toBe(true)
    expect(Number.isNaN(memoized(Number.NaN))).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('treats reference identity strictly (different object refs miss)', () => {
    const compute = vi.fn((obj: { x: number }) => obj.x)
    const memoized = singleEntryMemoize(compute)
    const a = { x: 1 }
    const b = { x: 1 }
    expect(memoized(a)).toBe(1)
    expect(memoized(a)).toBe(1)
    expect(memoized(b)).toBe(1)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('handles different arg counts correctly', () => {
    const compute = vi.fn((...args: number[]) => args.reduce((a, b) => a + b, 0))
    const memoized = singleEntryMemoize(compute)
    expect(memoized(1, 2)).toBe(3)
    expect(memoized(1, 2, 3)).toBe(6)
    expect(memoized(1, 2)).toBe(3)
    expect(compute).toHaveBeenCalledTimes(3)
  })
})
