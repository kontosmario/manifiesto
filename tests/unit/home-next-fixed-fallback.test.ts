import { describe, expect, it } from 'vitest'
import { computeNextFixedFallback } from '@/components/home/home-next-fixed-fallback'

describe('computeNextFixedFallback', () => {
  it('returns the empty-state fallback when no fijos are loaded yet', () => {
    expect(computeNextFixedFallback({ fixedCount: 0, hasNextFixed: false })).toEqual({
      kind: 'empty',
      primary: 'Carga tu primer gasto fijo', // copy refresh: drop accent
      secondary: 'Alquiler, servicios, suscripciones',
    })
  })

  it('returns null when at least one fijo exists (the next-fijo chip handles that case)', () => {
    expect(
      computeNextFixedFallback({ fixedCount: 3, hasNextFixed: true }),
    ).toBeNull()
  })

  it('returns null when fijos exist but all are paid (the all-paid band handles that case)', () => {
    // fixedCount > 0 means the user has loaded fijos at some point —
    // even if `hasNextFixed` is false (everything is paid for the
    // cycle), the empty-state CTA would be wrong. Defer to the
    // all-paid band rendered upstream.
    expect(
      computeNextFixedFallback({ fixedCount: 2, hasNextFixed: false }),
    ).toBeNull()
  })
})
