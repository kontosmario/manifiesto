import { describe, expect, it } from 'vitest'
import { ringGeometry } from '@/components/redesign/jardin/jardin-spec'

describe('ringGeometry', () => {
  it('aro grande 130/10 → r=59, C≈370.71', () => {
    const g = ringGeometry(130, 10)
    expect(g.r).toBe(59)
    expect(g.c).toBeCloseTo(370.708, 2)
  })
  it('aro día 40/4 → r=17, C≈106.81', () => {
    const g = ringGeometry(40, 4)
    expect(g.r).toBe(17)
    expect(g.c).toBeCloseTo(106.814, 2)
  })
})
