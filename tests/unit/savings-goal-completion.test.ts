import { describe, expect, it } from 'vitest'
import { contributionCompletedGoal } from '@/features/savings-goals/savings-goal.model'

describe('contributionCompletedGoal', () => {
  it('celebra cuando el aporte cruza de <objetivo a exactamente el objetivo', () => {
    // prev 80k, aporte llevó a 100k, objetivo 100k
    expect(contributionCompletedGoal(80_000, { currentAmount: 100_000, goalAmount: 100_000 })).toBe(true)
  })

  it('celebra cuando cruza por encima del objetivo', () => {
    expect(contributionCompletedGoal(90_000, { currentAmount: 120_000, goalAmount: 100_000 })).toBe(true)
  })

  it('NO celebra un aporte extra a una meta ya cumplida', () => {
    // ya estaba en 100k, aportó de nuevo → 110k
    expect(contributionCompletedGoal(100_000, { currentAmount: 110_000, goalAmount: 100_000 })).toBe(false)
  })

  it('NO celebra si el aporte no alcanza el objetivo', () => {
    expect(contributionCompletedGoal(50_000, { currentAmount: 80_000, goalAmount: 100_000 })).toBe(false)
  })

  it('NO celebra con objetivo 0 (meta inválida)', () => {
    expect(contributionCompletedGoal(0, { currentAmount: 0, goalAmount: 0 })).toBe(false)
  })
})
