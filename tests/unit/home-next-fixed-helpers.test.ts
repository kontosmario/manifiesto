import { describe, expect, it } from 'vitest'
import {
  computeNextFixed,
  formatDaysUntilDue,
} from '@/components/home/home-next-fixed-helpers'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'

function fixed(args: {
  id: string
  name: string
  amount: number
  next_due_on: string
  status?: 'active' | 'paused' | 'completed' | 'archived'
}): FixedExpense {
  return {
    id: args.id,
    family_id: 'fam',
    name: args.name,
    amount: args.amount,
    kind: 'monthly' as never,
    status: args.status ?? 'active',
    frequency: 'monthly',
    category_id: null,
    next_due_on: args.next_due_on,
    day_of_month: 1,
    ends_on: null,
    installments_total: null,
    installments_paid: 0,
    remaining_balance: null,
    lender_name: null,
    notes: null,
    notify_days_before: null,
    last_paid_at: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  }
}

const NOW = new Date('2026-04-10T10:30:00')

describe('computeNextFixed', () => {
  it('returns the soonest active fixed within the horizon', () => {
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: '1', name: 'Spotify', amount: 1500, next_due_on: '2026-04-20' }),
        fixed({ id: '2', name: 'Netflix', amount: 5400, next_due_on: '2026-04-13' }),
        fixed({ id: '3', name: 'Renta', amount: 350_000, next_due_on: '2026-05-01' }),
      ],
      now: NOW,
    })
    expect(out).toEqual({
      id: '2',
      name: 'Netflix',
      amount: 5400,
      daysUntil: 3,
      nextDueOn: '2026-04-13',
    })
  })

  it('skips inactive fijos', () => {
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: '1', name: 'Paused', amount: 100, next_due_on: '2026-04-11', status: 'paused' }),
        fixed({ id: '2', name: 'Done', amount: 100, next_due_on: '2026-04-12', status: 'completed' }),
        fixed({ id: '3', name: 'Active', amount: 5400, next_due_on: '2026-04-13' }),
      ],
      now: NOW,
    })
    expect(out?.id).toBe('3')
  })

  it('skips items already past due', () => {
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: 'past', name: 'Past', amount: 100, next_due_on: '2026-04-05' }),
        fixed({ id: 'soon', name: 'Soon', amount: 200, next_due_on: '2026-04-15' }),
      ],
      now: NOW,
    })
    expect(out?.id).toBe('soon')
  })

  it('respects the horizon — items beyond horizonDays are excluded', () => {
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: 'far', name: 'Far', amount: 100, next_due_on: '2026-04-30' }),
      ],
      now: NOW,
      horizonDays: 14,
    })
    expect(out).toBeNull()
  })

  it('default: no horizon — picks soonest regardless of distance', () => {
    // 60 days out (well past the legacy 14-day window). Default
    // behavior must still surface it because the sub-row inside the
    // Fijos panel always reflects the next due item.
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: 'far', name: 'Far', amount: 100, next_due_on: '2026-06-09' }),
      ],
      now: NOW,
    })
    expect(out?.id).toBe('far')
    expect(out?.daysUntil).toBe(60)
  })

  it('cycleEnd: excludes fijos whose next_due_on falls past the cycle end', () => {
    // Cycle ends May 1 (exclusive). A fijo due May 15 belongs to the
    // next cycle and must be hidden from the current-cycle chip.
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: 'next-cycle', name: 'Next', amount: 100, next_due_on: '2026-05-15' }),
      ],
      now: NOW,
      cycleEnd: new Date('2026-05-01T00:00:00'),
    })
    expect(out).toBeNull()
  })

  it('cycleEnd: returns the soonest in-cycle fijo when others are past the boundary', () => {
    // Apr 20 is in-cycle; Apr 30 (cycle end exclusive) is out; May 5 is
    // far out. Expect Apr 20 wins.
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: 'in-cycle', name: 'In',  amount: 100, next_due_on: '2026-04-20' }),
        fixed({ id: 'boundary', name: 'Out', amount: 100, next_due_on: '2026-04-30' }),
        fixed({ id: 'far',      name: 'Far', amount: 100, next_due_on: '2026-05-05' }),
      ],
      now: NOW,
      cycleEnd: new Date('2026-04-30T00:00:00'),
    })
    expect(out?.id).toBe('in-cycle')
  })

  it('returns null when no fijos exist', () => {
    expect(
      computeNextFixed({ fixedExpenses: [], now: NOW }),
    ).toBeNull()
  })

  it('handles same-day due (daysUntil === 0)', () => {
    const out = computeNextFixed({
      fixedExpenses: [
        fixed({ id: '1', name: 'Today', amount: 1000, next_due_on: '2026-04-10' }),
      ],
      now: NOW,
    })
    expect(out?.daysUntil).toBe(0)
  })
})

describe('formatDaysUntilDue', () => {
  it('returns "Vence hoy" for 0', () => {
    expect(formatDaysUntilDue(0)).toBe('Vence hoy')
  })

  it('returns "Mañana" for 1', () => {
    expect(formatDaysUntilDue(1)).toBe('Mañana')
  })

  it('returns "En N días" for ≥ 2', () => {
    expect(formatDaysUntilDue(2)).toBe('En 2 días')
    expect(formatDaysUntilDue(7)).toBe('En 7 días')
    expect(formatDaysUntilDue(14)).toBe('En 14 días')
  })

  it('clamps negative to "Vence hoy"', () => {
    expect(formatDaysUntilDue(-3)).toBe('Vence hoy')
  })
})
