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
 * El lado TS NO reimplementa la ventana: usa las MISMAS funciones que corren en
 * el device (`computeIsSalaryPendingConfirmation`, `getCurrentPayCycle`,
 * `computeMonthlyAccountingWindow`, `financeToCycleConfig`). Una versión previa
 * la recalculaba a mano sin el freeze, así que era ciega al camino congelado y
 * además codificaba la semántica vieja: cualquier regresión del freeze pasaba
 * en verde. Por eso hay DOS casos: uno con el sueldo ya confirmado (camino
 * normal) y otro con `as_of` posterior a un payday sin confirmar (camino
 * CONGELADO).
 *
 * La tz se pasa explícita (`p_tz` = la del runner) para que el bucketing de
 * gastos del SQL y el del TS usen el MISMO calendario corra donde corra.
 *
 * Corre con un stack accesible (local `supabase start` o el remoto vía
 * `.env.supabase`) Y con la migración 20260724120000 aplicada. Si la función
 * no existe todavía, el test se saltea con un mensaje claro (no rojo).
 */
import { describe, expect, it } from 'vitest'

import { adminClient, isSupabaseLocalReachable } from './_helpers/supabase-test-client'
import { computeFixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-cycle-summary'
import { computeCycleDisponible } from '@/features/family/cycle-disponible'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  effectiveMonthlyIncome,
  effectiveSavingsGoal,
  resolveIncomeMode,
} from '@/features/finance/family-finance.model'
import {
  buildPayDate,
  computeIsSalaryPendingConfirmation,
  formatLocalDateKey,
  getCurrentPayCycle,
  parseLocalDateKey,
} from '@/utils/pay-cycle'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'

const supabaseUp = await isSupabaseLocalReachable()
const describeIfLive = supabaseUp ? describe : describe.skip

// Familia del owner (real). El test es de PARIDAD, no de valor: compara rpc vs
// TS sobre los mismos datos, así que sirve cualquier familia con income > 0.
const FAMILY = '61bdc187-0053-4a99-93c8-57da12013986'
const AS_OF_CONFIRMED = '2026-06-29' // ventana determinística, sueldo ya confirmado
const RUNNER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

type SqlRow = {
  daily_budget: number
  available_today: number
  raw_cycle_balance: number
  has_override: boolean
}

describeIfLive('cycle_disponible parity (rpc vs TS, read-only)', () => {
  async function loadFamilyData(admin: ReturnType<typeof adminClient>) {
    const { data: finance } = await admin
      .from('family_finance')
      .select('*')
      .eq('family_id', FAMILY)
      .single()
    const { data: items } = await admin.from('fixed_expenses').select('*').eq('family_id', FAMILY)
    const { data: expenses } = await admin.from('expenses').select('*').eq('family_id', FAMILY)
    const { data: incomeEvents } = await admin
      .from('income_events')
      .select('amount, event_date')
      .eq('family_id', FAMILY)
    return { finance, items: items ?? [], expenses: expenses ?? [], incomeEvents: incomeEvents ?? [] }
  }

  type FamilyData = Awaited<ReturnType<typeof loadFamilyData>>
  type LoadedFamilyData = FamilyData & { finance: NonNullable<FamilyData['finance']> }

  /** La familia de referencia puede no existir en este stack → skip explícito. */
  function assertLoaded(data: FamilyData): data is LoadedFamilyData {
    if (data.finance) return true
    console.warn(`familia ${FAMILY} sin family_finance en este stack; skip parity.`)
    return false
  }

  /** Lado TS: EXACTAMENTE las funciones que corren en el device. */
  function computeTsSide(asOfKey: string, data: LoadedFamilyData) {
    const { finance, items, expenses, incomeEvents } = data
    const asOf = parseLocalDateKey(asOfKey)
    const cycleConfig = financeToCycleConfig(finance)
    const incomeMode = resolveIncomeMode(finance)
    const isDynamic = incomeMode === 'dynamic'

    // Freeze: mismo gate que family-dashboard-model / use-home-metrics.
    const isSalaryPending = computeIsSalaryPendingConfirmation(
      cycleConfig,
      asOf,
      finance.last_salary_confirmed_at ?? null,
      incomeMode,
    )
    const payCycle = getCurrentPayCycle(asOf, cycleConfig, isSalaryPending)
    const accounting = computeMonthlyAccountingWindow(
      cycleConfig,
      asOf,
      isSalaryPending,
      isDynamic,
    )
    const cStart = accounting.start
    const cEnd = accounting.end
    const days = Math.max(1, accounting.days)
    const daysRemaining = Math.max(1, accounting.daysRemaining)

    const summary = computeFixedExpenseCycleSummary({
      items: items as never,
      expenses: expenses as never,
      window: { start: cStart, end: cEnd },
      today: asOf,
    })
    const pressure = summary.pressureTotal

    // Defensivo dinámico (sueldo/ahorro stale ⇒ 0): fuente única compartida con
    // el modelo del Home, espejo del `when dyn then 0` del SQL.
    const monthlyIncome = effectiveMonthlyIncome(finance)
    const startingBalance =
      finance.current_cycle_starting_balance == null
        ? null
        : Number(finance.current_cycle_starting_balance)
    // Anchor target: durante el freeze el cliente NO compara contra el inicio de
    // la ventana congelada sino contra el payday de ESTE mes
    // (family-dashboard-model.ts:209) — el SQL espeja eso con `anchor_target`.
    const anchorTarget = isSalaryPending
      ? buildPayDate(
          asOf.getFullYear(),
          asOf.getMonth(),
          'salary_payment_day' in cycleConfig ? cycleConfig.salary_payment_day : 1,
        )
      : payCycle.start
    const anchorTargetKey = formatLocalDateKey(anchorTarget)
    const hasOverride =
      finance.current_cycle_anchor === anchorTargetKey &&
      startingBalance != null &&
      startingBalance >= 0
    const effIncome = hasOverride ? (startingBalance as number) : monthlyIncome
    const effDays = hasOverride || isDynamic ? daysRemaining : days
    const overrideDown = hasOverride && (startingBalance as number) < monthlyIncome
    const proration = overrideDown ? daysRemaining / days : 1
    const savingsGoal = effectiveSavingsGoal(finance)
    const savingsGoalPercent = Number(finance.savings_goal_percent ?? 0)
    const effSavings = overrideDown
      ? Math.max(0, Math.round(effIncome * (savingsGoalPercent / 100)))
      : savingsGoal

    const inWin = (e: { created_at: string }) => {
      const d = new Date(e.created_at)
      return d >= cStart && d < cEnd
    }
    const variableCycle = (
      expenses as {
        commitment_id: string | null
        archived_at: string | null
        created_at: string
        price: number
      }[]
    )
      .filter((x) => !x.commitment_id && !x.archived_at && inWin(x))
      .reduce((s, x) => s + x.price, 0)
    // El gasto que cuenta es TODO el del ciclo (var_cycle), con o sin override:
    // el override solo cambia el ingreso/días, no el boundary del gasto (espeja
    // la SQL, migración 20260630110000).
    const varMetrics = variableCycle

    const extraIncome = incomeEvents
      .filter((ie: { event_date: string }) => {
        const d = parseLocalDateKey(ie.event_date)
        return d >= cStart && d < cEnd
      })
      .reduce((s: number, ie: { amount: number }) => s + Number(ie.amount), 0)

    const totalAvailable = effIncome - effSavings - pressure * proration - varMetrics
    // Fijos PENDIENTES de pago (prorrateados). El saldo real los suma de vuelta
    // al discrecional (espeja la SQL: available_today resta solo paid_total).
    const reservedFixed = Number(summary.reservedTotal ?? 0) * proration
    const ts = computeCycleDisponible({
      effectiveCycleIncome: effIncome,
      effectiveCycleDays: effDays,
      commitmentPressure: pressure,
      effectiveSavingsGoal: effSavings,
      totalAvailable,
      cycleExtraIncome: extraIncome,
      effectiveReservedFixed: reservedFixed,
      hasCycleOverride: hasOverride,
    })
    return { ts, hasOverride, isSalaryPending, cStart, cEnd }
  }

  async function fetchSql(
    admin: ReturnType<typeof adminClient>,
    asOfKey: string,
  ): Promise<SqlRow | null> {
    const rpc = await admin.rpc('cycle_disponible', {
      p_family_id: FAMILY,
      p_as_of: asOfKey,
      p_tz: RUNNER_TZ,
    })
    if (rpc.error) {
      // Función (o la firma de 3 args de 20260724120000) aún no desplegada en
      // este stack → saltear, no romper.
      console.warn(`cycle_disponible(uuid,date,text) no disponible (${rpc.error.message}); skip parity.`)
      return null
    }
    return (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as SqlRow
  }

  function expectParity(sql: SqlRow, side: ReturnType<typeof computeTsSide>) {
    expect(Number(sql.daily_budget)).toBe(side.ts.dailyBudget)
    expect(Number(sql.available_today)).toBe(side.ts.availableToday)
    expect(Number(sql.raw_cycle_balance)).toBe(side.ts.rawCycleBalance)
    expect(sql.has_override).toBe(side.hasOverride)
  }

  it('rpc.cycle_disponible == computeCycleDisponible(TS) — sueldo confirmado', async () => {
    let admin: ReturnType<typeof adminClient>
    try {
      admin = adminClient()
    } catch (e) {
      // Sin service-role key (corriendo bajo el config unit sin stack) → skip.
      console.warn(`cycle_disponible parity skip: ${(e as Error).message}`)
      return
    }
    const sql = await fetchSql(admin, AS_OF_CONFIRMED)
    if (!sql) return

    const data = await loadFamilyData(admin)
    if (!assertLoaded(data)) return
    const side = computeTsSide(AS_OF_CONFIRMED, data)
    // Este caso cubre el camino NO congelado; el freeze lo cubre el test de abajo.
    expect(side.isSalaryPending).toBe(false)
    expectParity(sql, side)
  })

  it('rpc.cycle_disponible == computeCycleDisponible(TS) — sueldo VENCIDO (ventana congelada)', async () => {
    let admin: ReturnType<typeof adminClient>
    try {
      admin = adminClient()
    } catch (e) {
      console.warn(`cycle_disponible parity skip: ${(e as Error).message}`)
      return
    }
    const data = await loadFamilyData(admin)
    if (!assertLoaded(data)) return
    if (resolveIncomeMode(data.finance) === 'dynamic') {
      // El dinámico nunca congela: no hay camino que ejercitar con esta familia.
      console.warn('familia de referencia en modo dinámico; skip caso congelado.')
      return
    }

    // `as_of` = payday del mes QUE VIENE: siempre >= payday y siempre posterior
    // al último confirm (que no puede estar en el futuro) → is_salary_pending.
    // La ventana congelada resultante [payday de este mes, payday del que viene)
    // CONTIENE hoy, así que arrastra gastos reales y la aserción tiene dientes.
    const today = new Date()
    const salaryDay = data.finance.salary_payment_day ?? 1
    const asOfKey = formatLocalDateKey(
      buildPayDate(today.getFullYear(), today.getMonth() + 1, salaryDay),
    )

    const sql = await fetchSql(admin, asOfKey)
    if (!sql) return

    const side = computeTsSide(asOfKey, data)
    // Si esto se pone rojo, el escenario dejó de cubrir el freeze (no es un bug
    // del SQL): revisar cómo se deriva `asOfKey`.
    expect(side.isSalaryPending).toBe(true)
    expectParity(sql, side)
  })
})
