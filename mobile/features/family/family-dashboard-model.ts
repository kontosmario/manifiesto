import type { Expense } from '@/features/expenses/use-expenses'
import { DAY_MS } from '@/utils/time'
import {
  deriveSavingsGoalPercent,
  resolveFlexibleTargetPercent,
  TARGET_ESSENTIALS_PERCENT,
} from '@/features/finance/family-finance.model'
import {
  buildMonthlyHistoryRows,
  buildMonthlyHistoryTotals,
} from '@/features/family/family-dashboard-monthly-history'
import type {
  FamilyDashboardFinanceSnapshot,
  FamilyDashboardMonthlyHistoryRow,
  FamilyDashboardMonthlyHistoryTotals,
  FamilyDashboardSnapshot,
} from '@/features/family/family-dashboard.types'
import {
  computeFixedExpenseCycleSummary,
} from '@/features/fixed-expenses/commitment-utils'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import {
  buildPayDate,
  formatLocalDateKey,
  getCurrentPayCycle,
  normalizeToStartOfDay,
} from '@/utils/pay-cycle'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import {
  computeMonthlyAccountingWindow,
  type MonthlyAccountingWindow,
} from '@/utils/monthly-accounting'
const DEFAULT_SALARY_PAYMENT_DAY = 1
const DEFAULT_USD_EXCHANGE_RATE = 1000

function derivePercentAmount(total: number, percent: number) {
  if (!Number.isFinite(total) || total <= 0) {
    return 0
  }

  if (!Number.isFinite(percent) || percent <= 0) {
    return 0
  }

  return Math.round(((total * percent) / 100) * 100) / 100
}

interface BuildFamilyDashboardSnapshotInput {
  commitments?: FixedExpense[]
  expenses?: Expense[]
  finance?: FamilyDashboardFinanceSnapshot | null
  monthsBack?: number
  today?: Date
  /**
   * Plano de accounting mensual — la ventana sobre la que se calculan
   * saldo del mes, cupo diario, presión de fijos y proyección. Para
   * usuarios `monthly` coincide con `payCycle`; para weekly/biweekly/custom
   * es el mes calendario. Optional para call-sites legacy/tests; cuando
   * no se pasa se deriva de `finance + today`.
   *
   * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
   */
  monthlyAccounting?: MonthlyAccountingWindow
}

function parseConfirmedDate(value?: string | null): Date | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return normalizeToStartOfDay(parsedDate)
}

export function buildFamilyDashboardSnapshot({
  commitments = [],
  expenses = [],
  finance,
  monthsBack = 6,
  today = new Date(),
  monthlyAccounting,
}: BuildFamilyDashboardSnapshotInput): FamilyDashboardSnapshot {
  const todayDate = normalizeToStartOfDay(today)
  const salaryPaymentDay = finance?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY
  const currentMonthPayDate = buildPayDate(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    salaryPaymentDay,
  )
  const lastSalaryConfirmedDate = parseConfirmedDate(finance?.last_salary_confirmed_at ?? null)
  const isSalaryPendingConfirmation =
    todayDate >= currentMonthPayDate &&
    (!lastSalaryConfirmedDate || lastSalaryConfirmedDate < currentMonthPayDate)
  const cycleConfig = financeToCycleConfig(finance ?? undefined)
  const payCycle = getCurrentPayCycle(
    todayDate,
    cycleConfig,
    isSalaryPendingConfirmation,
  )
  // Monthly accounting window — el plano donde viven saldo/cupo/proyección
  // y la presión de fijos. Para monthly users coincide con `payCycle`; para
  // weekly/biweekly/custom es el mes calendario (sin regresión: el call-site
  // puede pasarlo explícito para mantener identidad estable con el hook,
  // si no lo derivamos aquí).
  const accounting =
    monthlyAccounting ?? computeMonthlyAccountingWindow(cycleConfig, todayDate)

  const currentMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  const nextMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1)
  const firstMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - (Math.max(1, Math.floor(monthsBack)) - 1),
    1,
  )

  let totalGeneral = 0
  let actualSpentInCurrentCycle = 0
  let variableSpentInCurrentCycle = 0
  let commitmentPaymentsInCurrentCycle = 0
  const monthlyTotalsByMonth = new Map<string, number>()

  expenses.forEach((expense) => {
    totalGeneral += expense.price

    const expenseDate = normalizeToStartOfDay(new Date(expense.created_at))
    if (Number.isNaN(expenseDate.getTime())) {
      return
    }

    // Bucket "este ciclo" se computa sobre la ventana mensual de
    // accounting — para monthly users coincide con `payCycle`; para
    // weekly/biweekly/custom es el mes calendario (que es lo que el
    // usuario percibe como "lo que llevo gastado este mes").
    if (expenseDate >= accounting.start && expenseDate < accounting.end) {
      actualSpentInCurrentCycle += expense.price
      if (expense.commitment_id) {
        commitmentPaymentsInCurrentCycle += expense.price
      } else {
        variableSpentInCurrentCycle += expense.price
      }
    }

    if (expenseDate >= firstMonthStart && expenseDate < nextMonthStart) {
      const monthStart = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), 1)
      const monthKey = monthStart.toISOString()
      const previousTotal = monthlyTotalsByMonth.get(monthKey) ?? 0
      monthlyTotalsByMonth.set(monthKey, previousTotal + expense.price)
    }
  })

  // Presión de fijos sobre la ventana mensual: clasifica next_due_on
  // contra `[accounting.start, accounting.end)` y suma pagos del mismo
  // window. Para monthly users es idéntico al payCycle; para no-monthly
  // los fijos ahora se clasifican por mes calendario.
  const currentCycleCommitmentSummary = computeFixedExpenseCycleSummary({
    items: commitments,
    expenses,
    window: { start: accounting.start, end: accounting.end },
    today: todayDate,
  })
  const monthlyIncome = finance?.monthly_income ?? 0
  // Modo dinámico: sin sueldo fijo — monthly_income queda 0 y el ciclo
  // se fondea con income_events (entran como cycleExtraIncome en
  // use-home-metrics). Cambia el reparto del cupo (días restantes) y
  // suprime los prompts de sueldo/saldo-inicial.
  const incomeMode: 'fixed' | 'dynamic' =
    finance?.income_mode === 'dynamic' ? 'dynamic' : 'fixed'
  const isDynamicIncome = incomeMode === 'dynamic'
  const savingsGoal = finance?.savings_goal ?? 0
  const savingsGoalPercent =
    typeof finance?.savings_goal_percent === 'number'
      ? finance.savings_goal_percent
      : deriveSavingsGoalPercent({
          monthlyIncome,
          savingsGoal,
        })
  const targetFlexiblePercent = resolveFlexibleTargetPercent(savingsGoalPercent)
  const commitmentPressureInCurrentCycle = currentCycleCommitmentSummary.pressureTotal

  // Cycle-starting-balance override: the user told us the actual
  // available cash for THIS cycle, separate from monthly_income.
  //
  // Anchor target: the date we compare the stored anchor against to
  // decide "is this for the current cycle?". When the pay cycle is
  // frozen (today is past payday and the user hasn't confirmed yet)
  // `payCycle.start` is held on the *previous* payday — using it as
  // the target would mean "anchor still matches" right when we most
  // want the prompt to surface. We pivot to `currentMonthPayDate`
  // during freeze: that's the date the cycle will land on the
  // moment the user confirms, so the prompt re-fires every entry
  // until they answer. After the confirm releases the freeze,
  // `payCycle.start === currentMonthPayDate`, so anchor still
  // matches and we don't re-prompt this cycle.
  const cycleAnchorTarget = isSalaryPendingConfirmation
    ? currentMonthPayDate
    : payCycle.start
  const currentCycleAnchorDateKey = formatLocalDateKey(cycleAnchorTarget)
  const storedAnchor = finance?.current_cycle_anchor ?? null
  const storedBalance = finance?.current_cycle_starting_balance ?? null
  const cycleAnchorMatchesCurrent =
    typeof storedAnchor === 'string' && storedAnchor === currentCycleAnchorDateKey
  const cycleStartingBalanceOverride =
    cycleAnchorMatchesCurrent && typeof storedBalance === 'number' && storedBalance >= 0
      ? storedBalance
      : null
  // En dinámico no se auto-abre el prompt de saldo inicial: el balance
  // se construye agregando ingresos, no confirmando un cobro.
  const isCycleStartingBalancePromptPending =
    !cycleAnchorMatchesCurrent && !isDynamicIncome

  // Effective income for the current cycle. When the user has
  // confirmed an override (e.g. mid-month signup with reduced cash),
  // every cycle-aware metric below uses this value with proration —
  // matching the engine path. Without an override, this equals
  // monthlyIncome and the math is identical to before.
  const hasCycleOverride = cycleStartingBalanceOverride !== null
  const effectiveCycleIncome = hasCycleOverride
    ? (cycleStartingBalanceOverride as number)
    : monthlyIncome
  // Días restantes/total del MES de accounting (no del salary cycle):
  // el cupo diario se proyecta sobre el plano mensual fijo.
  const remainingDaysFromToday = Math.max(1, accounting.daysRemaining)
  const totalCycleDays = Math.max(accounting.days, 1)
  // Effective cycle length the daily-budget formula divides into.
  // With override active, the daily cap spreads the user's reported
  // balance across the remaining days only (matches engine output).
  // Modo dinámico: mismo reparto sobre días restantes aunque no haya
  // override real (el "presupuesto" son los ingresos ya cargados).
  const effectiveCycleDays =
    hasCycleOverride || isDynamicIncome ? remainingDaysFromToday : totalCycleDays
  // Proration de fijos: cuando el override es DOWN (cobré menos que
  // el sueldo recurrente), recortar las fijos a los días restantes
  // tiene sentido (lo que YA pagué en los días anteriores ya pasó).
  // Cuando es UP, no recortamos.
  const overrideIsDown =
    hasCycleOverride && (cycleStartingBalanceOverride as number) < monthlyIncome
  const overrideProration = overrideIsDown ? remainingDaysFromToday / totalCycleDays : 1
  const effectiveCommitmentPressure = commitmentPressureInCurrentCycle * overrideProration
  // Fijos PENDIENTES de pago (reservados) del ciclo, prorrateados igual que la
  // presión. El SALDO del mes (plata real) NO los resta —solo los pagados— así
  // que se suman de vuelta al `totalAvailable` (que sí reserva todo) para obtener
  // el saldo real. El CUPO diario sí los reserva (usa `totalAvailable`), y el chip
  // los muestra como "por pagar". Modelo owner 2026-07-01.
  const effectiveCommitmentReserved =
    currentCycleCommitmentSummary.reservedTotal * overrideProration
  // Savings goal RECOMPUTA al cobro real cuando override es DOWN:
  // 20% del sueldo configurado (\$6.9M) sería \$1.4M, pero si el user
  // cobró \$4M, el target del mes debería ser 20% de \$4M = \$800K — no
  // un objetivo que ya nació inalcanzable. Para UP o sin override,
  // se mantiene el savings_goal configurado (la meta es la meta;
  // el extra del UP es bonus, no objetivo de ahorro mayor).
  // Owner feedback iterado 2026-06-08.
  const effectiveSavingsGoal = overrideIsDown
    ? Math.max(0, Math.round(effectiveCycleIncome * (savingsGoalPercent / 100)))
    : savingsGoal
  // Variable spend that "counts" toward this cycle = ALL variable spent this
  // cycle (`var_cycle`), con o sin override. El override solo cambia el INGRESO
  // del ciclo (un presupuesto BRUTO: sueldo/caja + arrastre), NO qué cuenta como
  // gastado — cada gasto variable del ciclo salió de ese presupuesto, así que se
  // resta el total del ciclo (mismo boundary que el path sin override). Intentos
  // previos (var_since_today, luego var_since_confirm) trataban el override como
  // una foto de saldo a mitad de ciclo y descartaban el gasto previo a confirmar,
  // inflando el saldo (bug 2026-06-30; ver docs de cycle_disponible).
  const variableSpentForCycleMetrics = variableSpentInCurrentCycle

  const flexibleTargetAmount = derivePercentAmount(effectiveCycleIncome, targetFlexiblePercent)
  const cycleBalanceBeforeSavings =
    effectiveCycleIncome -
    effectiveSavingsGoal -
    effectiveCommitmentPressure -
    variableSpentForCycleMetrics
  const savingsSpent = Math.min(effectiveSavingsGoal, Math.max(0, -cycleBalanceBeforeSavings))
  const savingsRemaining = Math.max(0, effectiveSavingsGoal - savingsSpent)
  const flexibleDelta = variableSpentForCycleMetrics - flexibleTargetAmount
  const flexibleRemaining = Math.max(0, flexibleTargetAmount - variableSpentForCycleMetrics)
  const totalAvailable = cycleBalanceBeforeSavings + savingsSpent
  // Monthly history uses the full monthly_income — historical rows
  // represent past cycles where the override doesn't apply.
  const monthlyHistory = buildMonthlyHistoryRows(
    monthlyTotalsByMonth,
    monthlyIncome,
    savingsGoal,
    todayDate,
    monthsBack,
  )
  const monthlyHistoryTotals = buildMonthlyHistoryTotals(monthlyHistory)
  const remainingUntilPayday = Math.round(
    (payCycle.end.getTime() - todayDate.getTime()) / DAY_MS,
  )

  return {
    actualSpentInCurrentCycle,
    commitmentPaymentsInCurrentCycle,
    commitmentPressureInCurrentCycle,
    effectiveCommitmentReserved,
    currentCycleCommitmentSummary,
    currentMonthPayDate,
    cycleBalanceBeforeSavings,
    dailyBudgetBufferMode: finance?.daily_budget_buffer_mode ?? 'none',
    dailyBudgetBufferValue: finance?.daily_budget_buffer_value ?? 0,
    dailyBudgetCheckinHour: finance?.daily_budget_checkin_hour ?? 9,
    dailyBudgetNudgesEnabled: finance?.daily_budget_nudges_enabled ?? true,
    fixedExpensesMonthlyTotal: commitmentPressureInCurrentCycle,
    flexibleDelta,
    flexibleRemaining,
    flexibleTargetAmount,
    isSalaryPendingConfirmation,
    monthlyHistory,
    monthlyHistoryTotals,
    monthlyAccounting: accounting,
    monthlyIncome,
    incomeMode,
    payCycle,
    remainingUntilPayday,
    salaryPaymentDay,
    // savingsGoal expuesto al cliente = effective para el cycle:
    // si override es DOWN, recalculado al cobro real con el percent
    // configurado. Sino, igual al savings_goal stored. Esto alinea
    // el chip ("Ahorrando \$X") con la realidad del ciclo en curso.
    savingsGoal: effectiveSavingsGoal,
    savingsGoalPercent,
    savingsRemaining,
    savingsSpent,
    spentInCurrentCycle: variableSpentInCurrentCycle,
    targetEssentialsPercent: TARGET_ESSENTIALS_PERCENT,
    targetFlexiblePercent,
    todayDate,
    totalAvailable,
    totalGeneral,
    usdExchangeRate: finance?.usd_exchange_rate ?? DEFAULT_USD_EXCHANGE_RATE,
    variableSpentInCurrentCycle,
    cycleStartingBalanceOverride,
    effectiveCycleIncome,
    effectiveCycleDays,
    isCycleStartingBalancePromptPending,
    cycleAnchorTarget,
  }
}

export type {
  FamilyDashboardFinanceSnapshot,
  FamilyDashboardMonthlyHistoryRow,
  FamilyDashboardMonthlyHistoryTotals,
  FamilyDashboardSnapshot,
}
