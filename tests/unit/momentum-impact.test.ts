import { describe, expect, it } from 'vitest'
import { composeMomentumImpact } from '@/features/insights/momentum-impact'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

function task(overrides: Partial<ControlAdvisorTask>): ControlAdvisorTask {
  return {
    id: 'x',
    emoji: '✅',
    cat: 'X',
    title: 'X',
    body: 'x',
    impact: '$',
    impactRaw: 0,
    cta: 'ok',
    urgency: 'baja',
    confidence: 1,
    dataDays: 30,
    ...overrides,
  }
}

describe('composeMomentumImpact', () => {
  // Regression: the previous math was
  //   `positive.impactRaw + reinforcer.impactRaw * 12`
  // which mixed cycle-scoped one-time amounts with annualized
  // monthly deltas. For a real account (kontosmario) it produced
  // headlines like "+$770.000 a favor" stacking a $50k cycle
  // excedente with a $60k/mes saving × 12 → $720k annual fantasy.
  it('uses the cycle-scoped excedente from positive-forecast as the headline (not a sum × 12)', () => {
    const positive = task({
      id: 'positive-forecast',
      impactRaw: 50_000,
      impactScope: 'oneTime',
    })
    const reinforcer = task({
      id: 'cat-win',
      impactRaw: 60_000, // monthly delta — the old code multiplied this × 12
    })
    const result = composeMomentumImpact(positive, reinforcer)
    expect(result.impactRaw).toBe(50_000)
    // Crucial regression assertion: never re-introduce the × 12 inflation.
    expect(result.impactRaw).not.toBe(50_000 + 60_000 * 12)
    expect(result.impactRaw).toBeLessThan(60_000 * 12)
  })

  it('returns an oneTime scope so downstream `annualizedImpact` math treats it as a one-shot, not recurring', () => {
    const positive = task({
      id: 'positive-forecast',
      impactRaw: 50_000,
      impactScope: 'oneTime',
    })
    const reinforcer = task({ id: 'cat-win', impactRaw: 60_000 })
    expect(composeMomentumImpact(positive, reinforcer).impactScope).toBe('oneTime')
  })

  it('produces a label scoped to the current cycle (not annualized)', () => {
    const positive = task({
      id: 'positive-forecast',
      impactRaw: 50_000,
      impactScope: 'oneTime',
    })
    const reinforcer = task({ id: 'savings-over', impactRaw: 20_000 })
    const result = composeMomentumImpact(positive, reinforcer)
    expect(result.label.toLowerCase()).toMatch(/ciclo|este mes|a favor/)
    expect(result.label.toLowerCase()).not.toMatch(/al año|anual/)
  })

  it('handles zero-impact reinforcer gracefully (savings-over can produce 0 in edge cases)', () => {
    const positive = task({
      id: 'positive-forecast',
      impactRaw: 50_000,
      impactScope: 'oneTime',
    })
    const reinforcer = task({ id: 'savings-over', impactRaw: 0 })
    expect(composeMomentumImpact(positive, reinforcer).impactRaw).toBe(50_000)
  })
})
