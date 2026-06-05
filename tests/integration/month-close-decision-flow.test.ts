import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, isSupabaseLocalReachable, userClient } from './_helpers/supabase-test-client'
import { cleanupFamily, seedMinimalFamily, type SeededFamily } from './_helpers/seed'

let reachable = false
let lastSeeded: SeededFamily | null = null

beforeAll(async () => { reachable = await isSupabaseLocalReachable() })
afterEach(async () => { if (lastSeeded) { await cleanupFamily(lastSeeded); lastSeeded = null } })

/**
 * Seed la familia + un monthly_summaries row simulando lo que el trigger
 * `trg_family_finance_on_salary_confirm` haría al cerrar el ciclo. La V2
 * RPC deriva sobrante desde esos campos (income - spent - savings_delta).
 */
async function seedFamilyWithSummary(
  income: number,
  spent: number,
  savingsDelta: number,
  periodStart = '2026-05-01',
  periodEnd = '2026-05-31',
  periodLabel = 'Mayo 2026',
): Promise<{ family: SeededFamily; summaryId: string }> {
  const family = await seedMinimalFamily('')
  const admin = adminClient()
  const { data: summary, error } = await admin
    .from('monthly_summaries')
    .insert({
      family_id: family.familyId,
      period_start: periodStart,
      period_end: periodEnd,
      period_label: periodLabel,
      total_variable_spent: spent,
      total_fixed_spent: 0,
      total_spent: spent,
      monthly_income: income,
      savings_goal_amount: 0,
      savings_delta: savingsDelta,
    })
    .select('id')
    .single()
  if (error) throw error
  return { family, summaryId: (summary as { id: string }).id }
}

describe('apply_month_close_decision V2 — E2E', () => {
  it('reserva: bumpea monthly_reserve_amount con sobrante derivado del summary', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 600_000, 100_000)
    lastSeeded = family
    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'reserva',
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: ff } = await admin
      .from('family_finance')
      .select('monthly_reserve_amount')
      .eq('family_id', family.familyId)
      .single()
    // sobrante = 1M - 600k - 100k = 300k
    expect(Number((ff as { monthly_reserve_amount: number | string }).monthly_reserve_amount)).toBe(300_000)
  })

  it('acumular: bumpea current_cycle_starting_balance + setea anchor', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 700_000, 0)
    lastSeeded = family

    const ANCHOR = '2026-06-01'
    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
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
    // sobrante = 1M - 700k - 0 = 300k
    const row = ff as { current_cycle_starting_balance: number | string; current_cycle_anchor: string }
    expect(Number(row.current_cycle_starting_balance)).toBe(300_000)
    expect(row.current_cycle_anchor).toBe(ANCHOR)
  })

  it('acumular sin newCycleAnchor falla (validación en RPC)', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 700_000, 0)
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'acumular',
    })
    expect(error).not.toBeNull()
    expect(String(error?.message)).toMatch(/cycle_anchor/i)
  })

  it('meta: bumpea savings_goals.current_amount', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 500_000, 200_000)
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
    const goalId = (goal as { id: string }).id

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'meta',
      p_meta_goal_id: goalId,
    })
    expect(error).toBeNull()

    const { data: goalAfter } = await admin
      .from('savings_goals')
      .select('current_amount')
      .eq('id', goalId)
      .single()
    // sobrante = 1M - 500k - 200k = 300k
    expect(Number((goalAfter as { current_amount: number | string }).current_amount)).toBe(300_000)
  })

  it('skip: solo inserta en month_close_decisions, no toca otras tablas', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 700_000, 0)
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'skip',
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: ff } = await admin
      .from('family_finance')
      .select('monthly_reserve_amount, current_cycle_starting_balance')
      .eq('family_id', family.familyId)
      .single()
    const row = ff as { monthly_reserve_amount: number | string; current_cycle_starting_balance: number | string | null }
    expect(Number(row.monthly_reserve_amount)).toBe(0)
    expect(row.current_cycle_starting_balance).toBeNull()

    // Pero sí hay decision row
    const { data: decision } = await admin
      .from('month_close_decisions')
      .select('decision')
      .eq('monthly_summary_id', summaryId)
      .single()
    expect((decision as { decision: string }).decision).toBe('skip')
  })

  it('idempotencia: 2do intento con mismo monthly_summary_id falla (unique violation)', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 700_000, 0)
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { error: first } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'reserva',
    })
    expect(first).toBeNull()

    const { error: second } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'reserva',
    })
    expect(second).not.toBeNull()
    expect(String(second?.message)).toMatch(/duplicate|unique/i)
  })

  it('summary_id inexistente: falla con "monthly_summary not found"', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('')
    lastSeeded = family
    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: '00000000-0000-0000-0000-000000000000',
      p_decision: 'reserva',
    })
    expect(error).not.toBeNull()
    expect(String(error?.message)).toMatch(/not found/i)
  })

  it('sobrante derivado: income=1M, spent=600k, savings_delta=100k → reserva +300k', async () => {
    if (!reachable) return
    const { family, summaryId } = await seedFamilyWithSummary(1_000_000, 600_000, 100_000)
    lastSeeded = family
    const client = userClient(family.ownerAccessToken)
    const { error } = await client.rpc('apply_month_close_decision', {
      p_monthly_summary_id: summaryId,
      p_decision: 'reserva',
    })
    expect(error).toBeNull()

    const admin = adminClient()
    const { data: decision } = await admin
      .from('month_close_decisions')
      .select('sobrante')
      .eq('monthly_summary_id', summaryId)
      .single()
    expect(Number((decision as { sobrante: number | string }).sobrante)).toBe(300_000)

    const { data: ff } = await admin
      .from('family_finance')
      .select('monthly_reserve_amount')
      .eq('family_id', family.familyId)
      .single()
    expect(Number((ff as { monthly_reserve_amount: number | string }).monthly_reserve_amount)).toBe(300_000)
  })
})
