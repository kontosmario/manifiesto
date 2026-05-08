/**
 * Integration tests for the `db_health_snapshot` RPC (Task 6.1).
 *
 * Tests:
 *   1. Shape — db_size_bytes > 0, table_sizes is array, limits_pro is defined.
 *
 * Skips gracefully when the local Supabase stack is not reachable.
 */
import { describe, expect, it } from 'vitest'

import { adminClient, isSupabaseLocalReachable } from './_helpers/supabase-test-client'

const supabaseUp = await isSupabaseLocalReachable()
const describeIfLive = supabaseUp ? describe : describe.skip

describeIfLive('db_health_snapshot', () => {
  it('returns shape with table_sizes and limits_pro', async () => {
    const admin = adminClient()
    const { data, error } = await admin.rpc('db_health_snapshot')
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    const d = data as Record<string, unknown>
    expect(typeof d.db_size_bytes === 'number' ? d.db_size_bytes : Number(d.db_size_bytes)).toBeGreaterThan(0)
    expect(Array.isArray(d.table_sizes)).toBe(true)
    expect(d.limits_pro).toBeDefined()
  })
})
