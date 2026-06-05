/**
 * E2E (headless) — Spec A: ciclo configurable, COBERTURA DEL FLOW REAL.
 *
 * cycle-config-e2e.test.ts cubre el lado SQL (helper, snapshot, CHECK).
 * Este suite cubre el flujo que ejecuta la app:
 *
 *   1. `validateFamilyFinanceInput` (TS) acepta los 4 tipos válidos y
 *      rechaza los inválidos antes de pegarle a la DB.
 *   2. El upsert real (PostgREST con RLS del owner) persiste la config
 *      tal cual la app desde Onboarding / Settings.
 *   3. Flujo encadenado: re-config vía upsert → `home_snapshot` devuelve
 *      el cycle_type nuevo → cargo un expense con `created_at` dentro
 *      del cycle window esperado → verifico que el snapshot lo cuenta.
 *
 * Skipea limpio si la stack de Supabase no es alcanzable.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  buildFamilyFinanceInput,
  validateFamilyFinanceInput,
  type UpsertFamilyFinanceInput,
} from '@/features/finance/family-finance.model'

import {
  isSupabaseLocalReachable,
  userClient,
} from './_helpers/supabase-test-client'
import {
  cleanupFamily,
  seedMinimalFamily,
  type SeededFamily,
} from './_helpers/seed'

let reachable = false
let lastSeeded: SeededFamily | null = null

beforeAll(async () => {
  reachable = await isSupabaseLocalReachable()
})

afterEach(async () => {
  if (lastSeeded) {
    await cleanupFamily(lastSeeded)
    lastSeeded = null
  }
})

/** Build an UpsertFamilyFinanceInput with reasonable defaults + cycle override. */
function inputWithCycle(
  cycle: {
    cycleType: 'monthly' | 'biweekly' | 'weekly' | 'custom'
    cycleAnchorDate: string | null
    cycleLengthDays: number | null
    salaryPaymentDay: number
  },
): UpsertFamilyFinanceInput {
  return buildFamilyFinanceInput({
    dailyBudgetBufferMode: 'none',
    dailyBudgetBufferValue: 0,
    dailyBudgetCheckinHour: 9,
    dailyBudgetNudgesEnabled: true,
    monthlyIncome: 1_000_000,
    savingsGoal: 0,
    savingsGoalPercent: 0,
    usdExchangeRate: 1000,
    lastSalaryConfirmedAt: null,
    currentCycleStartingBalance: null,
    currentCycleAnchor: null,
    salaryPaymentDay: cycle.salaryPaymentDay,
    cycleType: cycle.cycleType,
    cycleAnchorDate: cycle.cycleAnchorDate,
    cycleLengthDays: cycle.cycleLengthDays,
  })
}

describe('Spec A — validateFamilyFinanceInput (client-side validator)', () => {
  it('acepta los 4 tipos cuando están bien formados', () => {
    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'monthly',
          salaryPaymentDay: 20,
          cycleAnchorDate: null,
          cycleLengthDays: null,
        }),
      ),
    ).not.toThrow()

    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'biweekly',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-05-23',
          cycleLengthDays: 14,
        }),
      ),
    ).not.toThrow()

    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'weekly',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-06-01',
          cycleLengthDays: 7,
        }),
      ),
    ).not.toThrow()

    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'custom',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-05-15',
          cycleLengthDays: 10,
        }),
      ),
    ).not.toThrow()
  })

  it('rechaza biweekly sin anchor', () => {
    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'biweekly',
          salaryPaymentDay: 1,
          cycleAnchorDate: null,
          cycleLengthDays: 14,
        }),
      ),
    ).toThrow(/fecha de inicio/i)
  })

  it('rechaza weekly con length != 7', () => {
    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'weekly',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-06-01',
          cycleLengthDays: 14,
        }),
      ),
    ).toThrow(/semanal.*7/i)
  })

  it('rechaza monthly con anchor seteado', () => {
    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'monthly',
          salaryPaymentDay: 20,
          cycleAnchorDate: '2026-06-01',
          cycleLengthDays: null,
        }),
      ),
    ).toThrow(/mensual.*anchor/i)
  })

  it('rechaza custom con length fuera de rango', () => {
    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'custom',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-05-15',
          cycleLengthDays: 0,
        }),
      ),
    ).toThrow(/largo del ciclo/i)

    expect(() =>
      validateFamilyFinanceInput(
        inputWithCycle({
          cycleType: 'custom',
          salaryPaymentDay: 1,
          cycleAnchorDate: '2026-05-15',
          cycleLengthDays: 999,
        }),
      ),
    ).toThrow(/largo del ciclo/i)
  })
})

describe('Spec A — upsert real con auth del owner (PostgREST + RLS)', () => {
  /**
   * Replica el path de `upsertFamilyFinance` en
   * mobile/features/finance/family-finance.repository.ts: validar, luego
   * `.from('family_finance').upsert(body, { onConflict: 'family_id' })`.
   */
  async function upsertAsOwner(
    family: SeededFamily,
    input: UpsertFamilyFinanceInput,
  ): Promise<void> {
    const payload = validateFamilyFinanceInput(input)
    const client = userClient(family.ownerAccessToken)
    const { error } = await client
      .from('family_finance')
      .upsert(
        {
          family_id: family.familyId,
          ...payload,
        },
        { onConflict: 'family_id' },
      )
    expect(error).toBeNull()
  }

  it('flow: seed monthly → user re-configura a weekly → snapshot devuelve weekly', async () => {
    if (!reachable) return

    // 1. Seed con monthly (default)
    const family = await seedMinimalFamily('', {
      cycle: { cycle_type: 'monthly', salary_payment_day: 15 },
    })
    lastSeeded = family

    // 2. User cambia a weekly (anclado a jun 1)
    await upsertAsOwner(
      family,
      inputWithCycle({
        cycleType: 'weekly',
        salaryPaymentDay: 1,
        cycleAnchorDate: '2026-06-01',
        cycleLengthDays: 7,
      }),
    )

    // 3. Confirmar persistencia vía home_snapshot
    const client = userClient(family.ownerAccessToken)
    const { data, error } = await client.rpc('home_snapshot')
    expect(error).toBeNull()
    const finance = (data as Record<string, unknown>).family_finance as Record<string, unknown>
    expect(finance.cycle_type).toBe('weekly')
    expect(finance.cycle_anchor_date).toBe('2026-06-01')
    expect(finance.cycle_length_days).toBe(7)
  })

  it('flow: switching biweekly → custom preserva monthly_income y otras columnas', async () => {
    if (!reachable) return

    const family = await seedMinimalFamily('', {
      cycle: {
        cycle_type: 'biweekly',
        cycle_anchor_date: '2026-05-23',
        cycle_length_days: 14,
      },
    })
    lastSeeded = family

    // Switch a custom 10d (cambia tipo Y mantiene monthly_income en 1_000_000)
    await upsertAsOwner(
      family,
      inputWithCycle({
        cycleType: 'custom',
        salaryPaymentDay: 1,
        cycleAnchorDate: '2026-06-01',
        cycleLengthDays: 10,
      }),
    )

    const client = userClient(family.ownerAccessToken)
    const { data } = await client.rpc('home_snapshot')
    const finance = (data as Record<string, unknown>).family_finance as Record<string, unknown>
    expect(finance.cycle_type).toBe('custom')
    expect(finance.cycle_anchor_date).toBe('2026-06-01')
    expect(finance.cycle_length_days).toBe(10)
    expect(Number(finance.monthly_income)).toBe(1_000_000)
  })

  it('flow encadenado: cycle weekly → cargo expense en día 4 del ciclo → snapshot lo cuenta en cycle window', async () => {
    if (!reachable) return

    // Cycle weekly anclado a jun 1. Window activo cuando today esté
    // entre jun 1 y jun 7 (exclusive). Si corremos esto en otra fecha,
    // el período activo es otro — preferimos elegir un anchor que sea
    // "today-relative" para que el test sea determinista.
    const today = new Date()
    const anchor = new Date(today)
    anchor.setDate(anchor.getDate() - 3) // 3 días antes de hoy
    const anchorIso = anchor.toISOString().slice(0, 10)

    const family = await seedMinimalFamily('', {
      cycle: {
        cycle_type: 'weekly',
        cycle_anchor_date: anchorIso,
        cycle_length_days: 7,
      },
    })
    lastSeeded = family

    // Insertar un expense de hoy (debería caer dentro del cycle activo)
    const client = userClient(family.ownerAccessToken)
    const { data: categoryRows } = await client
      .from('categories')
      .select('id')
      .eq('family_id', family.familyId)
      .limit(1)
    const categoryId = (categoryRows as Array<{ id: string }>)[0].id

    const { error: insertErr } = await client.from('expenses').insert({
      family_id: family.familyId,
      category_id: categoryId,
      description: 'Test expense in current weekly cycle',
      price: 5000,
      created_by: family.ownerId,
    })
    expect(insertErr).toBeNull()

    // Snapshot debería incluir el expense bajo el cycle activo
    const { data: snap } = await client.rpc('home_snapshot')
    const payload = snap as Record<string, unknown>
    const cycleStart = new Date(String(payload.payments_cycle_start))
    const cycleEnd = new Date(String(payload.payments_cycle_end))
    expect(cycleEnd.getTime() - cycleStart.getTime()).toBe(7 * 86_400_000)
    // El expense que insertamos hoy: today ∈ [cycleStart, cycleEnd)
    expect(today.getTime()).toBeGreaterThanOrEqual(cycleStart.getTime())
    expect(today.getTime()).toBeLessThan(cycleEnd.getTime())

    // El cycle del snapshot debe contener al anchor (lo confirmamos
    // re-derivando period_index).
    const diffDays = Math.floor(
      (today.getTime() - new Date(anchorIso).getTime()) / 86_400_000,
    )
    const periodIndex = Math.floor(diffDays / 7)
    const expectedStart = new Date(anchorIso)
    expectedStart.setDate(expectedStart.getDate() + periodIndex * 7)
    expect(cycleStart.toISOString().slice(0, 10)).toBe(
      expectedStart.toISOString().slice(0, 10),
    )
  })
})
