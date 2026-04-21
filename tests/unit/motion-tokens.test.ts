import { describe, expect, it } from 'vitest'
import {
  motionDurations,
  motionSprings,
  motionEasings,
  motionStagger,
} from '@/lib/motion/tokens'

describe('motion tokens', () => {
  it('exposes the five canonical duration buckets', () => {
    expect(motionDurations).toEqual({
      micro: 120,
      quick: 180,
      standard: 240,
      deliberate: 320,
      slow: 480,
    })
  })

  it('exposes all six spring presets with damping/stiffness/mass', () => {
    const keys = ['press', 'enter', 'exit', 'value', 'celebrate', 'sheet'] as const
    for (const key of keys) {
      const spring = motionSprings[key]
      expect(spring.damping).toBeGreaterThan(0)
      expect(spring.stiffness).toBeGreaterThan(0)
      expect(spring.mass).toBeGreaterThan(0)
    }
  })

  it('celebrate spring has lower damping than press (overshoot behavior)', () => {
    expect(motionSprings.celebrate.damping).toBeLessThan(motionSprings.press.damping)
  })

  it('exposes three bezier easings + two stagger values', () => {
    expect(motionEasings.standard).toBeTypeOf('function')
    expect(motionEasings.accelerate).toBeTypeOf('function')
    expect(motionEasings.decelerate).toBeTypeOf('function')
    expect(motionStagger.listItem).toBe(40)
    expect(motionStagger.section).toBe(60)
  })
})
