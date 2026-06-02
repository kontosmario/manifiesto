import { describe, expect, it } from 'vitest'
import { computeDigitColumns } from '../../mobile/components/billing/digit-roll-math'

describe('computeDigitColumns', () => {
  it('returns one column per digit for an integer with 2 fraction digits', () => {
    // 4.99 → integer part "4", fractional "99" → 3 columns total (1 int + 2 frac)
    expect(computeDigitColumns(4.99, 2)).toEqual({
      integer: [4],
      fraction: [9, 9],
    })
  })

  it('handles multi-digit integer part', () => {
    expect(computeDigitColumns(39.99, 2)).toEqual({
      integer: [3, 9],
      fraction: [9, 9],
    })
  })

  it('pads fraction with leading zeros if value has fewer decimals', () => {
    expect(computeDigitColumns(40, 2)).toEqual({
      integer: [4, 0],
      fraction: [0, 0],
    })
  })

  it('rounds away invisible decimals (no half-rendered digits)', () => {
    // 19.895 is a classic IEEE-754 edge case: it's actually stored as
    // 19.8949999… so toFixed(2) yields "19.89" (not "19.90"). What
    // matters for our UI is that the function never produces a partial
    // digit — both columns are integers in 0..9. We assert toFixed
    // parity explicitly so future refactors don't silently change it.
    expect(computeDigitColumns(19.895, 2)).toEqual({
      integer: [1, 9],
      fraction: [8, 9],
    })
  })

  it('clamps zero correctly', () => {
    expect(computeDigitColumns(0, 2)).toEqual({
      integer: [0],
      fraction: [0, 0],
    })
  })

  it('throws on negative input (not expected in billing UI)', () => {
    expect(() => computeDigitColumns(-1, 2)).toThrow()
  })

  it('handles fractionDigits=0', () => {
    expect(computeDigitColumns(123, 0)).toEqual({
      integer: [1, 2, 3],
      fraction: [],
    })
  })
})
