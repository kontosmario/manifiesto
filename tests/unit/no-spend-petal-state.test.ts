import { describe, expect, it } from 'vitest'
import { decideNoSpendPetal } from '@/components/navigation/add-expense-tab-button-no-spend-decision'

describe('decideNoSpendPetal', () => {
  const baseInput = {
    isMutationPending: false,
    familyId: 'fam-1' as string | undefined,
    hasMarkedToday: false,
    hasExpensesTodayOwn: false,
  }

  it('returns noop:pending when a mutation is in flight', () => {
    const decision = decideNoSpendPetal({ ...baseInput, isMutationPending: true })
    expect(decision).toEqual({ kind: 'noop', reason: 'pending' })
  })

  it('returns noop:no-family when familyId is undefined', () => {
    const decision = decideNoSpendPetal({ ...baseInput, familyId: undefined })
    expect(decision).toEqual({ kind: 'noop', reason: 'no-family' })
  })

  it('returns unmark when already marked today', () => {
    const decision = decideNoSpendPetal({ ...baseInput, hasMarkedToday: true })
    expect(decision).toEqual({ kind: 'unmark' })
  })

  it('returns mark-confirm when today has expenses already', () => {
    const decision = decideNoSpendPetal({ ...baseInput, hasExpensesTodayOwn: true })
    expect(decision).toEqual({ kind: 'mark-confirm' })
  })

  it('returns mark-direct on clean state', () => {
    const decision = decideNoSpendPetal(baseInput)
    expect(decision).toEqual({ kind: 'mark-direct' })
  })

  it('pending guard wins over everything else', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: true,
      familyId: undefined,
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'noop', reason: 'pending' })
  })

  it('no-family guard wins over marked/expenses checks', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: false,
      familyId: undefined,
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'noop', reason: 'no-family' })
  })

  it('unmark wins over has-expenses (toggle priority)', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: false,
      familyId: 'fam-1',
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'unmark' })
  })
})
