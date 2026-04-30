// Force the runtime TZ to America/Argentina/Buenos_Aires (UTC-3) so the
// timezone-sensitive assertions are deterministic across environments.
// The user-facing bug we're locking is "expense at 22:00 ART grouped at
// the wrong day" — the test must reproduce ART consistently.
//
// IMPORTANT: This assignment must happen before any `Date` constructor
// runs in this module. Imports come AFTER so they don't capture the
// previous TZ.
process.env.TZ = 'America/Argentina/Buenos_Aires'

import { describe, expect, it } from 'vitest'
import { groupGastosByDay } from '@/features/gastos/gastos-aggregates.model'
import type { Expense } from '@/features/expenses/use-expenses'

function expense(args: {
  id?: string
  category_id?: string
  price?: number
  at: Date
  commitment_id?: string | null
}): Expense {
  return {
    id: args.id ?? Math.random().toString(36).slice(2),
    family_id: 'fam',
    user_id: 'u1',
    creator_display_name: 'tester',
    created_by: 'u1',
    category_id: args.category_id ?? 'food',
    commitment_id: args.commitment_id ?? null,
    created_at: args.at.toISOString(),
    description: 'tx',
    price: args.price ?? 1000,
  }
}

describe('groupGastosByDay (timezone-correct)', () => {
  it('labels today as "Hoy" and yesterday as "Ayer"', () => {
    const today = new Date(2026, 3, 14, 9)
    const expenses = [
      expense({ id: 't', at: new Date(2026, 3, 14, 8) }),
      expense({ id: 'y', at: new Date(2026, 3, 13, 18) }),
    ]
    const groups = groupGastosByDay({ expenses, today })
    expect(groups[0].label).toBe('Hoy')
    expect(groups[1].label).toBe('Ayer')
  })

  it('groups a 22:00 ART expense as "Ayer" when today is the following morning (timezone fix)', () => {
    const today = new Date(2026, 3, 14, 9)
    const expenses = [
      expense({ at: new Date(2026, 3, 13, 22) }), // 22:00 ART = 01:00 UTC Apr 14
    ]
    const groups = groupGastosByDay({ expenses, today })
    // Pre-fix this would land in "Hoy" because UTC Apr 14 == today UTC.
    // Post-fix it correctly lands in "Ayer".
    expect(groups[0].label).toBe('Ayer')
  })

  it('uses Spanish weekday + month for older days', () => {
    const today = new Date(2026, 3, 14, 9)
    const expenses = [
      expense({ at: new Date(2026, 3, 6, 12) }), // lun 6 abr
    ]
    const groups = groupGastosByDay({ expenses, today })
    expect(groups[0].label).toMatch(/lun 6 abr/)
  })

  it('sorts groups newest first', () => {
    const today = new Date(2026, 3, 14, 9)
    const expenses = [
      expense({ id: 'a', at: new Date(2026, 3, 10, 10) }),
      expense({ id: 'b', at: new Date(2026, 3, 12, 10) }),
      expense({ id: 'c', at: new Date(2026, 3, 14, 10) }),
    ]
    const groups = groupGastosByDay({ expenses, today })
    expect(groups.map((g) => g.day)).toEqual([14, 12, 10])
  })

  it('handles empty input', () => {
    const today = new Date(2026, 3, 14, 9)
    expect(groupGastosByDay({ expenses: [], today })).toEqual([])
  })
})
