/**
 * Integration tests for `cron_purge_archived_expenses` (Task 4.1).
 *
 * Verifies that the daily purge cron:
 *   - Hard-deletes expenses archived >14 days ago.
 *   - Keeps expenses archived ≤14 days ago.
 *   - Keeps live (not archived) expenses.
 *
 * Skips gracefully when the local Supabase stack is not reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  adminClient,
  isSupabaseLocalReachable,
} from './_helpers/supabase-test-client'
import {
  cleanupFamily,
  seedMinimalFamily,
  type SeededFamily,
} from './_helpers/seed'

describe('cron_purge_archived_expenses', () => {
  let family: SeededFamily

  beforeAll(async () => {
    const reachable = await isSupabaseLocalReachable()
    if (!reachable) return
    family = await seedMinimalFamily('-purge')
  })

  afterAll(async () => {
    await cleanupFamily(family)
  })

  it('deletes expenses archived more than 14 days ago, keeps newer ones', async () => {
    const reachable = await isSupabaseLocalReachable()
    if (!reachable) {
      console.log('Supabase local not reachable — skipping integration test')
      return
    }

    const admin = adminClient()

    // Insert: 1 archivado hace 15 días, 1 archivado hace 13 días, 1 sin archivar.
    // Fetch the category seeded by seedMinimalFamily
    const { data: catRow } = await admin
      .from('categories')
      .select('id')
      .eq('family_id', family.familyId)
      .limit(1)
      .single()
    const categoryId = catRow?.id as string

    const { error: insertErr } = await admin.from('expenses').insert([
      {
        family_id: family.familyId,
        category_id: categoryId,
        created_by: family.ownerId,
        description: 'old archived',
        price: 100,
        archived_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        family_id: family.familyId,
        category_id: categoryId,
        created_by: family.ownerId,
        description: 'recent archived',
        price: 200,
        archived_at: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        family_id: family.familyId,
        category_id: categoryId,
        created_by: family.ownerId,
        description: 'live',
        price: 300,
      },
    ])
    expect(insertErr).toBeNull()

    const { data: before } = await admin
      .from('expenses')
      .select('description')
      .eq('family_id', family.familyId)
    expect(before?.length).toBeGreaterThanOrEqual(3)

    const { error } = await admin.rpc('cron_purge_archived_expenses')
    expect(error).toBeNull()

    const { data: after } = await admin
      .from('expenses')
      .select('description')
      .eq('family_id', family.familyId)
    const descs = (after ?? []).map((r) => r.description)
    expect(descs).not.toContain('old archived')
    expect(descs).toContain('recent archived')
    expect(descs).toContain('live')
  })
})
