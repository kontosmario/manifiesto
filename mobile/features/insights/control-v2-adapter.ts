// Adapter: turns the raw data from the home_snapshot (+ a small extra
// query we'll add for monthly history) into the `ControlMockData` shape
// that `computeControlView` understands.
//
// Why keep the mock-shape as the boundary? Because it isolates ALL
// domain calculations in `computeControlView` — a single pure function
// that's easy to test. Swapping the UI between mock and real data is
// a one-line change at the call site.

import type { ControlMockData } from './control-v2-mock'
import type { Expense } from '@/features/expenses/expense-repository'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FamilyFinance } from '@/features/finance/use-family-finance'
import type { PayCycle } from '@/utils/pay-cycle'
import { computeFixedExpenseCycleSummary } from '@/features/fixed-expenses/commitment-cycle-summary'
import { emptyStates } from '@/lib/copy/states'
import { DAY_MS } from '@/utils/time'

/** One entry of the `category_breakdown` jsonb column.
 *  Matches the shape `close_monthly_cycle` writes (array of objects
 *  ordered by `total` desc). The legacy `Record<>` type was wrong —
 *  parsers in this file now read both shapes defensively. */
export interface MonthlyCategoryBreakdownEntry {
  category_id: string | null
  name: string | null
  color: string | null
  total: number
  count: number
  pct: number
}

/** One entry of the `daily_totals` jsonb column. */
export interface MonthlyDailyTotalEntry {
  day: string
  total: number
}

/** One entry of the `by_member` jsonb column — per-member spend at
 *  close. Written by `close_monthly_cycle`. Only meaningful for shared
 *  families; solo accounts collapse to a single entry. */
export interface MonthlyByMemberEntry {
  user_id: string | null
  display_name: string | null
  total: number
  count: number
}

/** `top_expense` column shape — null when the cycle had no
 *  variable spending at all. */
export interface MonthlyTopExpense {
  id: string
  description: string
  price: number
  category_id: string | null
  created_at: string
}

export interface MonthlySummaryHistory {
  id: string
  period_start: string
  period_end: string
  period_label: string
  total_variable_spent: number
  total_spent: number
  expenses_count: number
  monthly_income: number
  savings_delta: number
  category_breakdown:
    | MonthlyCategoryBreakdownEntry[]
    | Record<string, { amount: number; count: number }>
    | null
  daily_totals:
    | MonthlyDailyTotalEntry[]
    | Record<string, number>
    | null
  by_member: MonthlyByMemberEntry[] | null
  top_expense: MonthlyTopExpense | null
  delta_vs_previous_percent: number | null
  mood: string | null
  /** When set, the "Manifiesto Wrapped" of this cycle was already viewed
   *  (drives the header discoverability pulse). Null = not seen yet. */
  wrapped_seen_at: string | null
}

interface BuildControlDataArgs {
  /** Expenses for the current cycle (all, discretionary + committed). */
  expenses: Expense[]
  /** Active fixed expenses — used to derive monthly fijos total. */
  fixedExpenses: FixedExpense[]
  finance: FamilyFinance
  /** Last N monthly summaries ordered by period_start DESC. */
  summaries: MonthlySummaryHistory[]
  /** Current pay-cycle window anchored to `salary_payment_day`. */
  payCycle: PayCycle
  /** Override for testing — defaults to new Date(). */
  now?: Date
}

const MES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

const MES_ABBR_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

interface ParsedISODate {
  year: number
  month: number // 1-12
  day: number
}

function parseISODate(iso: string | null | undefined): ParsedISODate | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

/** Build the human-readable cycle range ("15 mar – 14 abr") only when
 *  the cycle is NOT calendar-aligned. For users with
 *  `salary_payment_day = 1` the cycle equals the calendar month and
 *  showing a range would be redundant; we return null and the UI
 *  falls back to the plain month label. `period_end` is exclusive in
 *  the rollup, so the display range subtracts one day to get the
 *  inclusive last day of the cycle. */
function buildCycleRangeLabel(
  periodStart: string,
  periodEnd: string,
): string | null {
  const start = parseISODate(periodStart)
  const end = parseISODate(periodEnd)
  if (!start || !end) return null
  // Calendar cycle: starts day 1 AND ends day 1 of the next month.
  if (start.day === 1 && end.day === 1) return null
  // Compute the inclusive last day = periodEnd - 1 day. Use the local
  // Date constructor (year, month-1, day) — no TZ pitfall.
  const lastDay = new Date(end.year, end.month - 1, end.day)
  lastDay.setDate(lastDay.getDate() - 1)
  const lastDayMonth = lastDay.getMonth() // 0-11
  const startStr = `${start.day} ${MES_ABBR_ES[start.month - 1]}`
  const endStr = `${lastDay.getDate()} ${MES_ABBR_ES[lastDayMonth]}`
  return `${startStr} – ${endStr}`
}

/**
 * Days in a closed cycle, derived from `[period_start, period_end)`
 * (period_end is exclusive). Falls back to 30 when either bound is
 * unparseable so prior-cycle averages don't blow up on bad data.
 */
function lastCycleDays(periodStart: string, periodEnd: string): number {
  const start = parseISODate(periodStart)
  const end = parseISODate(periodEnd)
  if (!start || !end) return 30
  const startMs = new Date(start.year, start.month - 1, start.day).getTime()
  const endMs = new Date(end.year, end.month - 1, end.day).getTime()
  const days = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000))
  return days > 0 ? days : 30
}

export function buildControlDataFromSnapshot(
  args: BuildControlDataArgs,
): ControlMockData {
  const { expenses, fixedExpenses, finance, summaries, payCycle } = args
  const now = args.now ?? new Date()

  // "diasMes" is reinterpreted as days-in-cycle; "diaActual" as the
  // 1-based position within the cycle. Both keep the same field
  // names so the downstream mock / UI components don't need renaming,
  // but the math is now anchored to `salary_payment_day` rather than
  // the calendar month.
  const cycleStart = payCycle.start
  const diasMes = payCycle.days
  const msPerDay = 86_400_000
  const diaActual = Math.max(
    1,
    Math.min(
      diasMes,
      Math.floor((startOfDay(now).getTime() - cycleStart.getTime()) / msPerDay) + 1,
    ),
  )
  const horaActual = now.getHours()
  const minActual = now.getMinutes()

  // Discretionary spend only — the `commitment_id` column ties an
  // expense row to a fixed_expense payment; Control's daily cupo is
  // defined over discretionary money, so committed spend is excluded.
  const discretionary = expenses.filter((e) => !e.commitment_id)

  // Today's discretionary spend.
  const todayStart = startOfDay(now)
  const gastoHoy = sumAmount(
    discretionary.filter((e) => new Date(e.created_at) >= todayStart),
  )

  // Per-day totals for cycle positions 1..(diaActual-1).
  const diasSpend: number[] = []
  const diasDow: number[] = []
  for (let i = 0; i < diaActual - 1; i++) {
    const dayStart = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i,
      0, 0, 0, 0,
    )
    const dayEnd = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i + 1,
      0, 0, 0, 0,
    )
    const total = sumAmount(
      discretionary.filter((e) => {
        const t = new Date(e.created_at).getTime()
        return t >= dayStart.getTime() && t < dayEnd.getTime()
      }),
    )
    diasSpend.push(total)
    // dow 0=Mon..6=Sun to match the mock convention
    const jsDow = dayStart.getDay() // 0=Sun..6=Sat
    diasDow.push((jsDow + 6) % 7)
  }

  // No-spend day indices (1-based within the cycle).
  const diasSinGastar = diasSpend
    .map((total, i) => (total === 0 ? i + 1 : null))
    .filter((v): v is number => v !== null)

  // Financial configuration.
  //
  // libreMes = sueldo − presión de fijos del ciclo − ahorro del mes
  //
  // "Presión de fijos" se calcula con el MISMO helper que el
  // family-dashboard (`computeFixedExpenseCycleSummary`) — suma
  // `paidInCycle + reservedInCycle`, o sea lo que se paga o se
  // reserva en esta ventana específica del ciclo. Antes aquí se
  // usaba `sumFixedMonthlyTotal` (equivalente mensual teórico:
  // weekly×4.33, quarterly/3…) que **no** coincidía con la
  // presión real del ciclo y desalineaba el cupo entre Control y
  // Home. Ahora ambas vistas reportan el mismo número.
  const ingresoMes = Math.max(0, finance.monthly_income ?? 0)
  const commitmentSummary = computeFixedExpenseCycleSummary({
    items: fixedExpenses,
    expenses,
    window: { start: payCycle.start, end: payCycle.end },
    today: now,
  })
  const fijosMes = commitmentSummary.pressureTotal
  const ahorroMes = Math.max(0, finance.savings_goal ?? 0)
  const libreMes = Math.max(0, ingresoMes - fijosMes - ahorroMes)
  const cupoDiario = libreMes / Math.max(1, diasMes)
  const fijosCobertura =
    ingresoMes > 0
      ? Math.ceil((fijosMes / ingresoMes) * diasMes)
      : 0

  // Next salary estimate: `salary_payment_day` is the anchor day each
  // month. Compute days until the next occurrence.
  const proximoSueldoEnDias = computeDaysUntilSalary(
    finance.salary_payment_day ?? 1,
    now,
  )

  // No-spend weekly progress (anchored to this week's Monday).
  const { metaNoSpendSemana, logrosNoSpendSemana } = computeWeeklyNoSpend(
    diasSpend,
    diaActual,
    now,
  )

  // Previous-month snapshot — pull from summaries[0] if available,
  // otherwise fall back to a neutral marker so the UI doesn't crash.
  const last = summaries[0]
  const prevMonthIndex = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthName = MES_ES[prevMonthIndex.getMonth()] ?? 'Mes anterior'
  const lastTopCat = last
    ? topCategoryFromBreakdown(last.category_breakdown)
    : { label: emptyStates.noData.title, categoryId: null, amount: 0, pct: 0 }
  // Cross-cycle category check: how much did the user spend THIS
  // cycle in the same category that was the worst last month? Lets
  // the UI raise an alert when the same drain repeats.
  const currentTopCatSpent = last
    ? sumAmount(
        discretionary.filter((e) => e.category_id === lastTopCat.categoryId),
      )
    : 0
  // Multi-cycle trend (oldest → newest, this cycle's projection at
  // the tail). Capped at 3 entries to keep the sparkline readable.
  const projectedThisCycle =
    diaActual > 0
      ? (sumAmount(discretionary) / Math.max(1, diaActual)) * diasMes
      : 0
  const summariesAsc = [...summaries]
    .filter((s) => (s.total_variable_spent ?? 0) > 0)
    .sort((a, b) => (a.period_start < b.period_start ? -1 : 1))
    .slice(-2)
    .map((s) => Number(s.total_variable_spent ?? 0))
  const trend = [...summariesAsc, projectedThisCycle]
    .filter((n) => Number.isFinite(n) && n > 0)
  const mesPasado = last
    ? {
        nombre: formatPeriodLabel(last.period_start) || prevMonthName,
        gastoTotal: last.total_variable_spent ?? 0,
        diasBajoCupo: countDaysBelowCupo(last.daily_totals, cupoDiario),
        promedioDiario:
          (last.total_variable_spent ?? 0) /
          Math.max(1, lastCycleDays(last.period_start, last.period_end)),
        topCat: lastTopCat,
        mood: normaliseMood(last.mood),
        savingsDelta: Number(last.savings_delta ?? 0),
        topExpense: last.top_expense
          ? {
              description: last.top_expense.description,
              price: Number(last.top_expense.price ?? 0),
            }
          : null,
        currentTopCatSpent,
        trend,
        cycleRangeLabel: buildCycleRangeLabel(last.period_start, last.period_end),
        categoryBreakdown: normaliseCategoryBreakdown(last.category_breakdown),
        byMember: normaliseByMember(last.by_member),
        dailyTotals: dailyTotalsToList(last.daily_totals),
      }
    : {
        nombre: prevMonthName,
        gastoTotal: 0,
        diasBajoCupo: 0,
        promedioDiario: 0,
        topCat: lastTopCat,
        mood: null,
        savingsDelta: 0,
        topExpense: null,
        currentTopCatSpent: 0,
        trend: [] as number[],
        cycleRangeLabel: null,
        categoryBreakdown: [] as MonthlyCategoryBreakdownEntry[],
        byMember: [] as MonthlyByMemberEntry[],
        dailyTotals: [] as number[],
      }

  // A previous cycle is worth comparing against only when it both
  // exists AND has non-zero discretionary spend. Otherwise the "Vs
  // mes pasado" card would show a misleading 100% delta vs a $0
  // baseline on first-run accounts.
  const hasPreviousMonth = Boolean(last) && (last?.total_variable_spent ?? 0) > 0

  return {
    ingresoMes,
    fijosMes,
    libreMes,
    cupoDiario,
    diasMes,
    diaActual,
    horaActual,
    minActual,
    gastoHoy,
    proximoSueldoEnDias,
    dias: diasSpend,
    diasDow,
    fijosCobertura,
    diasSinGastar,
    metaNoSpendSemana,
    logrosNoSpendSemana,
    mesPasado,
    hasPreviousMonth,
    // The advisor cards are intentionally empty here — phase 2 fills
    // them via the signals engine + LLM advisor. An empty array makes
    // the UI hide the Asesor section until we have real suggestions.
    tareas: [],
  }
}

// ─── helpers ────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function sumAmount(list: Expense[]): number {
  return list.reduce((acc, e) => acc + Number(e.price ?? 0), 0)
}

function computeDaysUntilSalary(paymentDay: number, now: Date): number {
  const today = now.getDate()
  if (paymentDay > today) return paymentDay - today
  // Next month's payment day.
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, paymentDay)
  const diff = nextMonth.getTime() - startOfDay(now).getTime()
  return Math.max(0, Math.round(diff / DAY_MS))
}

function computeWeeklyNoSpend(
  diasSpend: number[],
  diaActual: number,
  now: Date,
): { metaNoSpendSemana: number; logrosNoSpendSemana: number } {
  // Find days belonging to this week (Mon..today) within the
  // current month. Anything before day 1 we skip.
  const jsDow = now.getDay() // 0=Sun..6=Sat
  const offset = (jsDow + 6) % 7 // 0=Mon..6=Sun
  const weekStartDay = Math.max(1, diaActual - offset)
  const weekDays = diasSpend.slice(weekStartDay - 1, diaActual - 1)
  const logros = weekDays.filter((g) => g === 0).length
  return { metaNoSpendSemana: 3, logrosNoSpendSemana: logros }
}

/** Normalise the `category_breakdown` jsonb into the array shape the
 *  rest of the adapter assumes. Handles both the legacy `Record`
 *  shape (label → {amount, count}) and the current array shape
 *  produced by `close_monthly_cycle`. */
export function normaliseCategoryBreakdown(
  raw: MonthlySummaryHistory['category_breakdown'],
): MonthlyCategoryBreakdownEntry[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((entry) => ({
      category_id: entry.category_id ?? null,
      name: entry.name ?? null,
      color: entry.color ?? null,
      total: Number(entry.total ?? 0),
      count: Number(entry.count ?? 0),
      pct: Number(entry.pct ?? 0),
    }))
  }
  // Legacy Record<>
  let total = 0
  const entries = Object.entries(raw).map(([label, value]) => {
    const amount = Number(value?.amount ?? 0)
    total += amount
    return {
      category_id: null,
      name: label,
      color: null,
      total: amount,
      count: Number(value?.count ?? 0),
      pct: 0,
    } satisfies MonthlyCategoryBreakdownEntry
  })
  return entries
    .map((e) => ({ ...e, pct: total > 0 ? +((e.total / total) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.total - a.total)
}

/** Normalise `by_member` into a clean, spend-desc-sorted array, keeping
 *  only members that actually spent. The card uses the length of this
 *  list to decide whether the "quién gastó" module is meaningful (a
 *  solo account or a shared family where only one person spent collapses
 *  to <2 entries, so the module hides). */
export function normaliseByMember(
  raw: MonthlySummaryHistory['by_member'],
): MonthlyByMemberEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((m) => ({
      user_id: m.user_id ?? null,
      display_name: m.display_name ?? null,
      total: Number(m.total ?? 0),
      count: Number(m.count ?? 0),
    }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
}

function topCategoryFromBreakdown(
  raw: MonthlySummaryHistory['category_breakdown'],
): { label: string; categoryId: string | null; amount: number; pct: number } {
  const list = normaliseCategoryBreakdown(raw)
  if (list.length === 0) {
    return { label: emptyStates.noData.title, categoryId: null, amount: 0, pct: 0 }
  }
  const top = list[0]!
  return {
    label: top.name ?? 'Sin nombre',
    categoryId: top.category_id,
    amount: top.total,
    pct: top.pct,
  }
}

/** Defensive parser for `daily_totals`. Accepts the array shape
 *  written by `close_monthly_cycle` AND the legacy `Record<day, total>`
 *  shape so historical summaries keep rendering. */
export function dailyTotalsToList(
  raw: MonthlySummaryHistory['daily_totals'],
): number[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((d) => Number(d.total ?? 0))
      .filter((n) => Number.isFinite(n))
  }
  return Object.values(raw)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
}

function countDaysBelowCupo(
  daily: MonthlySummaryHistory['daily_totals'],
  cupo: number,
): number {
  if (cupo <= 0) return 0
  return dailyTotalsToList(daily).filter((g) => g <= cupo).length
}

/** Coerce the free-form `mood` string into the discriminated union
 *  the UI consumes. Anything outside the trio collapses to null so
 *  the card falls back to a neutral chrome. */
function normaliseMood(raw: string | null): 'green' | 'yellow' | 'red' | null {
  if (raw === 'green' || raw === 'yellow' || raw === 'red') return raw
  return null
}

/** Extract the month name from a DB date (`YYYY-MM-DD`). Parses the
 *  string directly to avoid the JS Date pitfall: `new Date('2026-03-01')`
 *  is parsed as UTC midnight, which in ART (UTC-3) rolls back to
 *  Feb 28 21:00, and `.getMonth()` returns the previous month. The
 *  bug surfaced as "Vs Marzo" rendering as "Vs Febrero" the day after
 *  closing the cycle. */
function formatPeriodLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return ''
  const monthIdx = Number(match[2]) - 1
  return MES_ES[monthIdx] ?? ''
}
