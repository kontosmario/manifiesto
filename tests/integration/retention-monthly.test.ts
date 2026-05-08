/**
 * Integration tests for `cron_apply_retention_policies()` (Task 4.2).
 *
 * Verifies:
 *   1. Notifications older than 90 days are purged; recent ones (30 days) remain.
 *   2. monthly_summaries keeps only the latest 12 per family after inserting 15.
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

describe('cron_apply_retention_policies', () => {
  let family: SeededFamily

  beforeAll(async () => {
    const reachable = await isSupabaseLocalReachable()
    if (!reachable) return
    family = await seedMinimalFamily('-retention')
  })

  afterAll(async () => {
    await cleanupFamily(family)
  })

  it('purges notifications older than 90 days, keeps recent ones', async () => {
    const reachable = await isSupabaseLocalReachable()
    if (!reachable) {
      console.log('Supabase local not reachable — skipping integration test')
      return
    }

    const admin = adminClient()
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error: insertErr } = await admin.from('notifications').insert([
      {
        family_id: family.familyId,
        title: 'old notification',
        body: '',
        kind: 'test_retention',
        severity: 'info',
        created_at: old,
      },
      {
        family_id: family.familyId,
        title: 'recent notification',
        body: '',
        kind: 'test_retention',
        severity: 'info',
        created_at: recent,
      },
    ])
    expect(insertErr).toBeNull()

    const { error: rpcErr } = await admin.rpc('cron_apply_retention_policies')
    expect(rpcErr).toBeNull()

    const { data } = await admin
      .from('notifications')
      .select('title')
      .eq('family_id', family.familyId)
      .eq('kind', 'test_retention')

    const titles = (data ?? []).map((r) => r.title)
    expect(titles).not.toContain('old notification')
    expect(titles).toContain('recent notification')
  })

  it('keeps only the latest 12 monthly_summaries per family', async () => {
    const reachable = await isSupabaseLocalReachable()
    if (!reachable) {
      console.log('Supabase local not reachable — skipping integration test')
      return
    }

    const admin = adminClient()

    // Seed 15 ciclos using years 2022-2023 to avoid invalid month numbers.
    // period_end uses day 28 to be valid for all months including February.
    const rows = Array.from({ length: 15 }, (_, i) => {
      const year = 2022 + Math.floor(i / 12)
      const month = (i % 12) + 1
      const monthStr = String(month).padStart(2, '0')
      return {
        family_id: family.familyId,
        period_start: `${year}-${monthStr}-01`,
        period_end: `${year}-${monthStr}-28`,
        period_label: `Ciclo ${i + 1}`,
        total_variable_spent: 100 * (i + 1),
        total_spent: 100 * (i + 1),
      }
    })

    // Clean existing summaries for this family first.
    await admin.from('monthly_summaries').delete().eq('family_id', family.familyId)
    const { error: insertErr } = await admin.from('monthly_summaries').insert(rows)
    expect(insertErr).toBeNull()

    const { error: rpcErr } = await admin.rpc('cron_apply_retention_policies')
    expect(rpcErr).toBeNull()

    const { data } = await admin
      .from('monthly_summaries')
      .select('period_start')
      .eq('family_id', family.familyId)
      .order('period_start', { ascending: false })

    expect(data?.length).toBe(12)
  })
})
