/**
 * Golden shape test for the `home_snapshot` RPC.
 *
 * Locks in the top-level keys returned by `home_snapshot()` against the
 * LOCAL Supabase stack. The RPC is about to be rewritten in Task 2.2 to
 * cap array sizes; this test guarantees that the rewrite preserves the
 * external contract (no keys added or removed silently).
 *
 * Skips gracefully when the local Supabase stack is not reachable so the
 * suite does not fail in environments without it (e.g. CI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  isSupabaseLocalReachable,
  userClient,
} from './_helpers/supabase-test-client'
import {
  cleanupFamily,
  seedMinimalFamily,
  type SeededFamily,
} from './_helpers/seed'

// Sorted list of every top-level key that the current `home_snapshot` RPC
// returns when called by an authenticated user that belongs to a family.
// Keep this list sorted alphabetically — the test compares sorted arrays.
const EXPECTED_KEYS = [
  'categories_expense',
  'categories_fixed_expense',
  'expenses',
  'family',
  'family_finance',
  'family_members',
  'fixed_expense_payments',
  'fixed_expenses',
  'has_push_subscription',
  'notifications',
  'payments_cycle_end',
  'payments_cycle_start',
  'period_month',
  'profile',
  'savings_goal',
  'unread_notification_count',
] as const

const supabaseUp = await isSupabaseLocalReachable()
const describeIfLive = supabaseUp ? describe : describe.skip

describeIfLive('home_snapshot shape (golden)', () => {
  let family: SeededFamily | null = null

  beforeAll(async () => {
    family = await seedMinimalFamily('-shape')
  }, 30_000)

  afterAll(async () => {
    await cleanupFamily(family)
  }, 30_000)

  it('returns the expected top-level keys', async () => {
    if (!family) throw new Error('family not seeded')
    const sb = userClient(family.ownerAccessToken)
    const { data, error } = await sb.rpc('home_snapshot')
    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const keys = Object.keys(data as Record<string, unknown>).sort()
    expect(keys).toEqual([...EXPECTED_KEYS].sort())
  })

  it('expenses array length is bounded to <= 120', async () => {
    if (!family) throw new Error('family not seeded')
    const sb = userClient(family.ownerAccessToken)
    const { data } = await sb.rpc('home_snapshot')
    const expenses = (data as { expenses: unknown[] }).expenses
    expect(Array.isArray(expenses)).toBe(true)
    expect(expenses.length).toBeLessThanOrEqual(120)
  })

  it('fixed_expenses array length is bounded to <= 100', async () => {
    if (!family) throw new Error('family not seeded')
    const sb = userClient(family.ownerAccessToken)
    const { data } = await sb.rpc('home_snapshot')
    const fixed = (data as { fixed_expenses: unknown[] }).fixed_expenses
    expect(Array.isArray(fixed)).toBe(true)
    expect(fixed.length).toBeLessThanOrEqual(100)
  })
})
