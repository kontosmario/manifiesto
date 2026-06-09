import { describe, expect, it } from 'vitest'
import {
  decorativeDurations,
  motionDurations,
  motionSprings,
  motionEasings,
  motionStagger,
} from '@/lib/motion/tokens'

describe('motion tokens', () => {
  it('exposes the canonical duration buckets', () => {
    expect(motionDurations.micro).toBe(120)
    expect(motionDurations.quick).toBe(180)
    expect(motionDurations.standard).toBe(240)
    expect(motionDurations.deliberate).toBe(320)
    expect(motionDurations.slow).toBe(480)
  })

  it('exposes navigation transition durations', () => {
    expect(motionDurations.enterStack).toBe(280)
    expect(motionDurations.exitStack).toBe(200)
    expect(motionDurations.enterModal).toBe(320)
    expect(motionDurations.exitModal).toBe(220)
    expect(motionDurations.enterTab).toBe(240)
    expect(motionDurations.exitTab).toBe(140)
  })

  it('exposes shakeStep for error-feedback shake sequences', () => {
    expect(motionDurations.shakeStep).toBe(50)
  })

  it('keeps every navigation exit shorter than its corresponding enter', () => {
    // Locks in the "exit-faster-than-enter" UX rule for nav transitions.
    expect(motionDurations.exitStack).toBeLessThan(motionDurations.enterStack)
    expect(motionDurations.exitModal).toBeLessThan(motionDurations.enterModal)
    expect(motionDurations.exitTab).toBeLessThan(motionDurations.enterTab)
  })

  it('exposes spring presets with damping/stiffness/mass', () => {
    const keys = ['press', 'enter', 'exit', 'value', 'celebrate', 'sheet', 'tabShift'] as const
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

  it('exposes decorative loop durations outside the UI-interaction range', () => {
    // Decorative durations live above the UI bucket (480ms) by design.
    // If a value drops below this floor it should probably move to
    // `motionDurations` instead.
    expect(decorativeDurations.breath).toBeGreaterThan(motionDurations.slow)
    expect(decorativeDurations.halo).toBeGreaterThan(motionDurations.slow)
    expect(decorativeDurations.shimmer).toBeGreaterThan(motionDurations.slow)
    expect(decorativeDurations.ambient).toBeGreaterThan(motionDurations.slow)
  })

  it('exposes bezier easings + two stagger values', () => {
    expect(motionEasings.standard).toBeTypeOf('function')
    expect(motionEasings.accelerate).toBeTypeOf('function')
    expect(motionEasings.decelerate).toBeTypeOf('function')
    expect(motionEasings.enterSmooth).toBeTypeOf('function')
    expect(motionEasings.exitStandard).toBeTypeOf('function')
    expect(motionEasings.warm).toBeTypeOf('function')
    expect(motionStagger.listItem).toBe(40)
    expect(motionStagger.section).toBe(60)
  })
})
