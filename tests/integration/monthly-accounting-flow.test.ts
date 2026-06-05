/**
 * Integration test del reframe mensual (Spec A.5).
 *
 * Verifica paridad clave:
 *   - Monthly users: `monthlyAccounting === payCycle` (cero regresión)
 *   - Non-monthly users: `monthlyAccounting === mes calendario` (uniformidad)
 *
 * E2E: seed family con cycle, llamar home_snapshot autenticado, validar
 * que el cliente puede derivar el accounting window correctamente desde
 * el row `family_finance` que el snapshot expone.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  isSupabaseLocalReachable,
  userClient,
} from './_helpers/supabase-test-client'
import {
  cleanupFamily,
  seedMinimalFamily,
  type SeededFamily,
} from './_helpers/seed'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'
import { getCurrentPayCycle, normalizeToStartOfDay } from '@/utils/pay-cycle'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'

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

describe('Monthly accounting reframe — paridad', () => {
  it('monthly user: monthlyAccounting EXACTAMENTE matchea payCycle (zero regresión AR)', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = { cycle_type: 'monthly' as const, salary_payment_day: 20 }
    const pay = getCurrentPayCycle(today, config)
    const ma = computeMonthlyAccountingWindow(config, today)
    expect(ma.start.getTime()).toBe(pay.start.getTime())
    expect(ma.end.getTime()).toBe(pay.end.getTime())
    expect(ma.days).toBe(pay.days)
  })

  it('biweekly user: monthlyAccounting es el mes calendario, NO el cycle de 14 días', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = {
      cycle_type: 'biweekly' as const,
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14 as const,
    }
    const pay = getCurrentPayCycle(today, config)
    const ma = computeMonthlyAccountingWindow(config, today)
    // ma anchored a día 1 del mes calendar
    expect(ma.start.getDate()).toBe(1)
    expect(ma.days).toBeGreaterThanOrEqual(28)
    expect(ma.days).toBeLessThanOrEqual(31)
    // pay cycle es 14 días — distinto
    expect(pay.days).toBe(14)
    expect(ma.days).not.toBe(pay.days)
  })

  it('weekly user: monthlyAccounting es mes calendario', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = {
      cycle_type: 'weekly' as const,
      cycle_anchor_date: '2026-06-01',
      cycle_length_days: 7 as const,
    }
    const ma = computeMonthlyAccountingWindow(config, today)
    expect(ma.start.getDate()).toBe(1)
    expect(ma.days).toBeGreaterThanOrEqual(28)
  })

  it('custom user N=10: monthlyAccounting sigue siendo mes calendario', () => {
    const today = normalizeToStartOfDay(new Date())
    const config = {
      cycle_type: 'custom' as const,
      cycle_anchor_date: '2026-05-15',
      cycle_length_days: 10,
    }
    const pay = getCurrentPayCycle(today, config)
    const ma = computeMonthlyAccountingWindow(config, today)
    expect(ma.start.getDate()).toBe(1)
    expect(ma.days).toBeGreaterThanOrEqual(28)
    expect(pay.days).toBe(10)
  })
})

describe('Monthly accounting reframe — E2E con DB', () => {
  it('seed family weekly + home_snapshot: cliente deriva monthly window correcto', async () => {
    if (!reachable) return

    const family = await seedMinimalFamily('', {
      cycle: {
        cycle_type: 'weekly',
        cycle_anchor_date: '2026-06-01',
        cycle_length_days: 7,
      },
    })
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { data, error } = await client.rpc('home_snapshot')
    expect(error).toBeNull()
    const finance = (data as Record<string, unknown>).family_finance as Record<string, unknown>

    // El snapshot expone el cycle_type — el cliente lo deriva al accounting
    expect(finance.cycle_type).toBe('weekly')
    const today = normalizeToStartOfDay(new Date())
    const cycleConfig = financeToCycleConfig({
      cycle_type: finance.cycle_type as 'weekly',
      salary_payment_day: finance.salary_payment_day as number,
      cycle_anchor_date: finance.cycle_anchor_date as string,
      cycle_length_days: finance.cycle_length_days as number,
    } as never)
    const ma = computeMonthlyAccountingWindow(cycleConfig, today)
    expect(ma.days).toBeGreaterThanOrEqual(28)
    // Y el cycle real es 7 días — el reframe lo desacopla
    expect(ma.days).not.toBe(7)
  })

  it('seed family monthly: el accounting matchea el cycle (zero regresión backend)', async () => {
    if (!reachable) return

    const family = await seedMinimalFamily('', {
      cycle: { cycle_type: 'monthly', salary_payment_day: 20 },
    })
    lastSeeded = family

    const client = userClient(family.ownerAccessToken)
    const { data } = await client.rpc('home_snapshot')
    const finance = (data as Record<string, unknown>).family_finance as Record<string, unknown>
    expect(finance.cycle_type).toBe('monthly')

    const today = normalizeToStartOfDay(new Date())
    const cycleConfig = financeToCycleConfig({
      cycle_type: 'monthly',
      salary_payment_day: finance.salary_payment_day as number,
      cycle_anchor_date: null,
      cycle_length_days: null,
    } as never)
    const pay = getCurrentPayCycle(today, cycleConfig)
    const ma = computeMonthlyAccountingWindow(cycleConfig, today)
    expect(ma.start.getTime()).toBe(pay.start.getTime())
    expect(ma.end.getTime()).toBe(pay.end.getTime())
    expect(ma.days).toBe(pay.days)
  })
})
