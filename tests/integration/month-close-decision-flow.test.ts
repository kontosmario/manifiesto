import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, isSupabaseLocalReachable, userClient } from './_helpers/supabase-test-client'
import { cleanupFamily, seedMinimalFamily, type SeededFamily } from './_helpers/seed'

let reachable = false
let lastSeeded: SeededFamily | null = null

beforeAll(async () => { reachable = await isSupabaseLocalReachable() })
afterEach(async () => { if (lastSeeded) { await cleanupFamily(lastSeeded); lastSeeded = null } })

const TEST_MONTH_ISO = '2026-05-01'
const SOBRANTE = 50_000

describe('apply_month_close_decision RPC — E2E', () => {
  it('reserva: incrementa monthly_reserve_amount', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'reserva',
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: ff } = await admin
      .from('family_finance')
      .select('monthly_reserve_amount')
      .eq('family_id', family.familyId)
      .single()
    expect(Number((ff as any).monthly_reserve_amount)).toBe(SOBRANTE)
  })

  it('acumular: bumpea current_cycle_starting_balance + setea anchor', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const ANCHOR = '2026-06-01'
    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'acumular',
      p_new_cycle_anchor: ANCHOR,
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: ff } = await admin
      .from('family_finance')
      .select('current_cycle_starting_balance, current_cycle_anchor')
      .eq('family_id', family.familyId)
      .single()
    expect(Number((ff as any).current_cycle_starting_balance)).toBe(SOBRANTE)
    expect((ff as any).current_cycle_anchor).toBe(ANCHOR)
  })

  it('acumular sin newCycleAnchor falla (validación en RPC)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'acumular',
    })
    expect(error).not.toBeNull()
    expect(String(error?.message)).toMatch(/cycle_anchor/i)
  })

  it('meta: incrementa savings_goals.current_amount', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const admin = adminClient()
    // Crear una meta primero
    const { data: goal } = await admin
      .from('savings_goals')
      .insert({
        family_id: family.familyId,
        title: 'Test meta',
        emoji: '🎯',
        goal_amount: 100_000,
        current_amount: 0,
        is_active: true,
      })
      .select('id')
      .single()
    const goalId = (goal as any).id

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'meta',
      p_meta_goal_id: goalId,
    })
    expect(error).toBeNull()

    const { data: goalAfter } = await admin
      .from('savings_goals')
      .select('current_amount')
      .eq('id', goalId)
      .single()
    expect(Number((goalAfter as any).current_amount)).toBe(SOBRANTE)
  })

  it('skip: solo inserta en month_close_decisions, no toca otras tablas', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'skip',
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: ff } = await admin
      .from('family_finance')
      .select('monthly_reserve_amount, current_cycle_starting_balance')
      .eq('family_id', family.familyId)
      .single()
    expect(Number((ff as any).monthly_reserve_amount)).toBe(0)
    expect((ff as any).current_cycle_starting_balance).toBeNull()

    // Pero sí hay decision row
    const { data: decision } = await admin
      .from('month_close_decisions')
      .select('decision')
      .eq('family_id', family.familyId)
      .eq('month_iso', TEST_MONTH_ISO)
      .single()
    expect((decision as any).decision).toBe('skip')
  })

  it('idempotencia: 2do intento con mismo (family, month) falla', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error: first } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'reserva',
    })
    expect(first).toBeNull()

    const { error: second } = await client.rpc('apply_month_close_decision', {
      p_family_id: family.familyId,
      p_month_iso: TEST_MONTH_ISO,
      p_sobrante: SOBRANTE,
      p_decision: 'reserva',
    })
    expect(second).not.toBeNull()
    expect(String(second?.message)).toMatch(/duplicate|unique/i)
  })
})
