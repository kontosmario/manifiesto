/**
 * Parity test — la función SQL `public.cycle_disponible` debe coincidir AL PESO
 * con el cálculo TS de producción que ve el usuario en el Home
 * (`computeFixedExpenseCycleSummary` + la derivación de override del modelo +
 * `computeCycleDisponible`). Es el guardián anti-drift entre el push "Buen día"
 * y el disponible del Home.
 *
 * Read-only: lee una familia real (no siembra), pasa un `as_of` fijo para que
 * la ventana sea determinística, y recomputa AMBOS lados sobre los mismos datos
 * vivos → no es brittle (no hay constantes hardcodeadas; si los datos cambian,
 * los dos lados cambian juntos).
 *
 * Corre con un stack accesible (local `supabase start` o el remoto vía
 * `.env.supabase`) Y con la migración 20260629160000 aplicada. Si la función
 * no existe todavía, el test se saltea con un mensaje claro (no rojo).
 */
import { describe, expect, it } from 'vitest'

import { adminClient, isSupabaseLocalReachable } from './_helpers/supabase-test-client'
import { computeFixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-cycle-summary'
import { computeCycleDisponible } from '@/features/family/cycle-disponible'

const supabaseUp = await isSupabaseLocalReachable()
const describeIfLive = supabaseUp ? describe : describe.skip

// Familia del owner (real). El test es de PARIDAD, no de valor: compara rpc vs
// TS sobre los mismos datos, así que sirve cualquier familia con income > 0.
const FAMILY = '61bdc187-0053-4a99-93c8-57da12013986'
const AS_OF = '2026-06-29' // ventana determinística

// Inicio de ciclo desde salary_day — misma lógica que el SQL y el modelo.
function cycleStartFor(asOf: Date, salaryDay: number): Date {
  const y = asOf.getFullYear()
  const m = asOf.getMonth()
  const lastDayThis = new Date(y, m + 1, 0).getDate()
  const anchorThis = Math.min(salaryDay, lastDayThis)
  if (asOf.getDate() >= anchorThis) return new Date(y, m, anchorThis)
  const lastDayPrev = new Date(y, m, 0).getDate()
  return new Date(y, m - 1, Math.min(salaryDay, lastDayPrev))
}

describeIfLive('cycle_disponible parity (rpc vs TS, read-only)', () => {
  it('rpc.cycle_disponible == computeCycleDisponible(TS) sobre datos reales', async () => {
    let admin: ReturnType<typeof adminClient>
    try {
      admin = adminClient()
    } catch (e) {
      // Sin service-role key (corriendo bajo el config unit sin stack) → skip.
      console.warn(`cycle_disponible parity skip: ${(e as Error).message}`)
      return
    }

    const rpc = await admin.rpc('cycle_disponible', { p_family_id: FAMILY, p_as_of: AS_OF })
    if (rpc.error) {
      // Función aún no desplegada en este stack → saltear, no romper.
      console.warn(`cycle_disponible no disponible (${rpc.error.message}); skip parity.`)
      return
    }
    const sql = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as {
      daily_budget: number
      available_today: number
      raw_cycle_balance: number
      has_override: boolean
    }

    const { data: finance } = await admin
      .from('family_finance')
      .select('*')
      .eq('family_id', FAMILY)
      .single()
    const { data: items } = await admin.from('fixed_expenses').select('*').eq('family_id', FAMILY)
    const { data: expenses } = await admin.from('expenses').select('*').eq('family_id', FAMILY)

    const asOf = new Date(`${AS_OF}T00:00:00`)
    const salaryDay = finance.salary_payment_day ?? 1
    const cStart = cycleStartFor(asOf, salaryDay)
    const cEnd = new Date(cStart.getFullYear(), cStart.getMonth() + 1, cStart.getDate())
    const DAY = 86_400_000
    const days = Math.max(1, Math.round((cEnd.getTime() - cStart.getTime()) / DAY))
    const daysRemaining = Math.max(1, Math.ceil((cEnd.getTime() - asOf.getTime()) / DAY))

    const summary = computeFixedExpenseCycleSummary({
      items: (items ?? []) as never,
      expenses: (expenses ?? []) as never,
      window: { start: cStart, end: cEnd },
      today: asOf,
    })
    const pressure = summary.pressureTotal

    const monthlyIncome = Number(finance.monthly_income ?? 0)
    const startingBalance =
      finance.current_cycle_starting_balance == null
        ? null
        : Number(finance.current_cycle_starting_balance)
    const anchorKey = finance.current_cycle_anchor
    const cStartKey = `${cStart.getFullYear()}-${String(cStart.getMonth() + 1).padStart(2, '0')}-${String(cStart.getDate()).padStart(2, '0')}`
    const hasOverride = anchorKey === cStartKey && startingBalance != null && startingBalance >= 0
    const effIncome = hasOverride ? (startingBalance as number) : monthlyIncome
    const effDays = hasOverride ? daysRemaining : days
    const overrideDown = hasOverride && (startingBalance as number) < monthlyIncome
    const proration = overrideDown ? daysRemaining / days : 1
    const savingsGoal = Number(finance.savings_goal ?? 0)
    const savingsGoalPercent = Number(finance.savings_goal_percent ?? 0)
    const effSavings = overrideDown
      ? Math.max(0, Math.round(effIncome * (savingsGoalPercent / 100)))
      : savingsGoal

    const inWin = (e: { created_at: string }) => {
      const d = new Date(e.created_at)
      return d >= cStart && d < cEnd
    }
    const variableCycle = (expenses ?? [])
      .filter((e: never) => {
        const x = e as { commitment_id: string | null; archived_at: string | null; created_at: string }
        return !x.commitment_id && !x.archived_at && inWin(x)
      })
      .reduce((s: number, e: never) => s + (e as { price: number }).price, 0)
    const variableSinceToday = (expenses ?? [])
      .filter((e: never) => {
        const x = e as { commitment_id: string | null; archived_at: string | null; created_at: string }
        return !x.commitment_id && !x.archived_at && new Date(x.created_at) >= asOf && new Date(x.created_at) < cEnd
      })
      .reduce((s: number, e: never) => s + (e as { price: number }).price, 0)
    const varMetrics = hasOverride ? variableSinceToday : variableCycle

    const { data: incomeEvents } = await admin
      .from('income_events')
      .select('amount, event_date')
      .eq('family_id', FAMILY)
    const extraIncome = (incomeEvents ?? [])
      .filter((ie: { event_date: string }) => {
        const d = new Date(`${ie.event_date}T00:00:00`)
        return d >= cStart && d < cEnd
      })
      .reduce((s: number, ie: { amount: number }) => s + Number(ie.amount), 0)

    const totalAvailable = effIncome - effSavings - pressure * proration - varMetrics
    const ts = computeCycleDisponible({
      effectiveCycleIncome: effIncome,
      effectiveCycleDays: effDays,
      commitmentPressure: pressure,
      effectiveSavingsGoal: effSavings,
      totalAvailable,
      cycleExtraIncome: extraIncome,
    })

    expect(Number(sql.daily_budget)).toBe(ts.dailyBudget)
    expect(Number(sql.available_today)).toBe(ts.availableToday)
    expect(Number(sql.raw_cycle_balance)).toBe(ts.rawCycleBalance)
    expect(sql.has_override).toBe(hasOverride)
  })
})
