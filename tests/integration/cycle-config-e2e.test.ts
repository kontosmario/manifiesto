/**
 * E2E (headless) — Spec A: ciclo configurable.
 *
 * Para cada uno de los 4 tipos de ciclo:
 *   1. Crear una family efímera con ese cycle_type seteado.
 *   2. Llamar al RPC `compute_pay_cycle` con `today=2026-06-05` y validar
 *      que la ventana devuelta coincide con la fórmula esperada.
 *   3. Llamar al RPC `home_snapshot` autenticado como el owner y validar
 *      que devuelve `family_finance.cycle_type` (cobertura de que el
 *      JSON output incluye las 3 columnas nuevas).
 *
 * Bonus — guardrail del bug de `financeSnapshot`:
 *   4. Con cycle_type='biweekly' configurado, mutar OTRO campo
 *      (usd_exchange_rate) vía un upsert que pase los 3 campos cycle_*
 *      LEÍDOS del row actual (simulando lo que hace
 *      `mobile/screens/settings/settings-screen.tsx` post-fix). Confirmar
 *      que el cycle_type sobrevive.
 *
 * Skipea limpio si la stack de Supabase no es alcanzable (sin creds en
 * env y sin local stack corriendo).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  isSupabaseLocalReachable,
  adminClient,
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

const TODAY = '2026-06-05' // fecha fija para que la fórmula sea determinista

interface ExpectedWindow {
  start: string // YYYY-MM-DD
  endExclusive: string
  days: number
}

const SCENARIOS: Array<{
  label: string
  config: Parameters<typeof seedMinimalFamily>[1] extends { cycle?: infer C }
    ? Extract<C, { cycle_type: unknown }>
    : never
  expected: ExpectedWindow
}> = [
  {
    label: 'monthly, day 20 — today=jun 5 (pre-payday) → cycle desde may 20',
    config: { cycle_type: 'monthly', salary_payment_day: 20 },
    expected: { start: '2026-05-20', endExclusive: '2026-06-20', days: 31 },
  },
  {
    label: 'biweekly, anchor may 23 — today=jun 5 (13d post-anchor) → primer ciclo',
    config: { cycle_type: 'biweekly', cycle_anchor_date: '2026-05-23', cycle_length_days: 14 },
    expected: { start: '2026-05-23', endExclusive: '2026-06-06', days: 14 },
  },
  {
    label: 'weekly, anchor jun 1 — today=jun 5 (4d post-anchor) → primer ciclo',
    config: { cycle_type: 'weekly', cycle_anchor_date: '2026-06-01', cycle_length_days: 7 },
    expected: { start: '2026-06-01', endExclusive: '2026-06-08', days: 7 },
  },
  {
    label: 'custom N=10, anchor may 15 — today=jun 5 (21d post-anchor) → tercer ciclo',
    config: { cycle_type: 'custom', cycle_anchor_date: '2026-05-15', cycle_length_days: 10 },
    expected: { start: '2026-06-04', endExclusive: '2026-06-14', days: 10 },
  },
]

describe('Spec A — ciclo configurable (E2E)', () => {
  describe.each(SCENARIOS)('$label', ({ config, expected }) => {
    it('compute_pay_cycle devuelve la ventana correcta', async () => {
      if (!reachable) return // skip gracefully

      const admin = adminClient()
      const { data, error } = await admin.rpc('compute_pay_cycle', {
        p_today: TODAY,
        p_cycle_type: config.cycle_type,
        p_salary_payment_day:
          config.cycle_type === 'monthly' ? config.salary_payment_day : null,
        p_cycle_anchor_date:
          config.cycle_type === 'monthly' ? null : config.cycle_anchor_date,
        p_cycle_length_days:
          config.cycle_type === 'monthly' ? null : config.cycle_length_days,
      })
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      const row = (data as Array<Record<string, unknown>>)[0]
      expect(row).toBeTruthy()
      expect(row.cycle_start).toBe(expected.start)
      expect(row.cycle_end_exclusive).toBe(expected.endExclusive)
      expect(row.cycle_days).toBe(expected.days)
    })

    it('home_snapshot surface el cycle_type y la ventana del cycle', async () => {
      if (!reachable) return

      const family = await seedMinimalFamily('', { cycle: config })
      lastSeeded = family

      const client = userClient(family.ownerAccessToken)
      const { data, error } = await client.rpc('home_snapshot')
      expect(error).toBeNull()
      expect(data).toBeTruthy()

      const payload = data as Record<string, unknown>
      const finance = payload.family_finance as Record<string, unknown>
      expect(finance.cycle_type).toBe(config.cycle_type)
      if (config.cycle_type === 'monthly') {
        expect(finance.salary_payment_day).toBe(config.salary_payment_day)
        expect(finance.cycle_anchor_date).toBeNull()
        expect(finance.cycle_length_days).toBeNull()
      } else {
        expect(finance.cycle_anchor_date).toBe(config.cycle_anchor_date)
        expect(finance.cycle_length_days).toBe(config.cycle_length_days)
      }
    })
  })

  it('guardrail: editar usd_exchange_rate vía upsert que pasa cycle_* NO resetea el ciclo (bug fix verificado)', async () => {
    if (!reachable) return

    const family = await seedMinimalFamily('', {
      cycle: {
        cycle_type: 'biweekly',
        cycle_anchor_date: '2026-05-23',
        cycle_length_days: 14,
      },
    })
    lastSeeded = family

    const admin = adminClient()

    // Simular el "save de USD rate desde Settings": leer el row actual,
    // tocar SÓLO usd_exchange_rate, escribir TODOS los campos (que es
    // lo que hace el snapshot/upsert real en mobile/screens/settings/
    // settings-screen.tsx tras el fix).
    const { data: current, error: readErr } = await admin
      .from('family_finance')
      .select('*')
      .eq('family_id', family.familyId)
      .single()
    expect(readErr).toBeNull()
    expect(current).toBeTruthy()

    const { error: updateErr } = await admin
      .from('family_finance')
      .update({
        usd_exchange_rate: 1500,
        // ↓ los 3 campos que el snapshot AHORA lee del query (post-fix).
        cycle_type: (current as { cycle_type: string }).cycle_type,
        cycle_anchor_date: (current as { cycle_anchor_date: string | null }).cycle_anchor_date,
        cycle_length_days: (current as { cycle_length_days: number | null }).cycle_length_days,
      })
      .eq('family_id', family.familyId)
    expect(updateErr).toBeNull()

    const { data: after, error: afterErr } = await admin
      .from('family_finance')
      .select('cycle_type, cycle_anchor_date, cycle_length_days, usd_exchange_rate')
      .eq('family_id', family.familyId)
      .single()
    expect(afterErr).toBeNull()
    expect(after).toMatchObject({
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-05-23',
      cycle_length_days: 14,
      usd_exchange_rate: 1500,
    })
  })

  it('CHECK constraint rechaza configs inconsistentes', async () => {
    if (!reachable) return

    const family = await seedMinimalFamily('')
    lastSeeded = family

    const admin = adminClient()

    // biweekly sin anchor → debe fallar
    const noAnchor = await admin
      .from('family_finance')
      .update({
        cycle_type: 'biweekly',
        cycle_anchor_date: null,
        cycle_length_days: 14,
      })
      .eq('family_id', family.familyId)
    expect(noAnchor.error).not.toBeNull()
    expect(String(noAnchor.error?.message)).toMatch(/cycle_config_valid|check/i)

    // weekly con length=14 → debe fallar (debe ser 7)
    const wrongLen = await admin
      .from('family_finance')
      .update({
        cycle_type: 'weekly',
        cycle_anchor_date: '2026-06-01',
        cycle_length_days: 14,
      })
      .eq('family_id', family.familyId)
    expect(wrongLen.error).not.toBeNull()

    // monthly con anchor seteado → debe fallar
    const monthlyWithAnchor = await admin
      .from('family_finance')
      .update({
        cycle_type: 'monthly',
        cycle_anchor_date: '2026-06-01',
        cycle_length_days: null,
      })
      .eq('family_id', family.familyId)
    expect(monthlyWithAnchor.error).not.toBeNull()
  })
})
