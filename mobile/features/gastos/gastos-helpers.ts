// Helpers puros del feed de Gastos. Extraídos de `gastos-v2-screen.tsx`
// para que la screen pueda concentrarse en orquestación (data fetching,
// estado UI, render). Cero side effects: todos los exports son
// funciones puras + constantes. Testeables aislados sin renderer.
import i18n from '@/lib/i18n'
import { formatWeekdayDayMonth } from '@/utils/date-format'
import type { IncomeEvent } from '@/features/income/use-income-events'
import type { Expense } from '@/features/expenses/use-expenses'

// ─── Tipos compartidos del feed ──────────────────────────────────
//
// Movement items mix expenses + incomes in a single day's row list.
// Income usa el mismo row chrome que expense (ver `IncomeRow`),
// diferenciado por color + pill — así slot natural en la SectionList.
// Sort order dentro de un día: incomes primero (top of the day),
// expenses por hora desc. Income surfacea como un "first thing that
// happened" anchor sin romper el feed cronológico.
export type MovementItem =
  | { kind: 'expense'; iso: string; expense: Expense }
  | { kind: 'income'; iso: string; income: IncomeEvent }

export interface MovimientosSection {
  title: string
  day: number
  /** Local-day epoch ms (startOf the section's day in the user's local
   *  timezone). Used to sort sections chronologically across month
   *  boundaries — sorting by `day` (1–31) alone bleeds: en un ciclo
   *  May 25 → Jun 24, day 31 (May) numerically beats day 4 (Jun) y
   *  today / yesterday terminaban al FONDO del list. */
  dateMs: number
  total: number
  /** Mixed rows: incomes prepended to expenses (incomes at the top of
   *  the day, expenses below). Ambos renderean con su row chrome propio
   *  vía `IncomeRow` / `GastoRow` — chrome unificado para que income lea
   *  como una row más (color + pill diferencian). */
  data: MovementItem[]
  /** Raw income list for the day. Se mantiene en la section para
   *  surfaces futuros (e.g. day-level totals o filters); el feed visible
   *  lee `data`. */
  incomes: IncomeEvent[]
}

// ─── Helpers de income ───────────────────────────────────────────
//
// Fallback label para un income cuyo `description` está vacío. El
// `IncomeRow` component es dueño del mapeo kind → emoji + pill copy;
// esto es solo un "qué mostrar como title del row" lookup.
export function incomeKindFallback(kind: IncomeEvent['kind']): string {
  switch (kind) {
    case 'transfer':
      return i18n.t('gastos:incomeRow.kind.transfer')
    case 'bonus':
      return i18n.t('gastos:incomeRow.kind.bonus')
    case 'gift':
      return i18n.t('gastos:incomeRow.kind.gift')
    case 'other':
    default:
      return i18n.t('gastos:incomeRow.kind.other')
  }
}

/**
 * Canonical "what time did this income happen" — local-noon epoch ms
 * derived from `event_date` ("YYYY-MM-DD") when present, falling back
 * to `created_at` cuando el row viene de un code path que no setea
 * event_date. Used everywhere que necesita slotear un income en un day
 * bucket o sortearlo cronológicamente junto a los expenses. Elimina el
 * back-date bug donde filter/sort por created_at filaba un backdated
 * income bajo "today" en vez del día que el user eligió.
 */
export function incomeHappenedAtMs(income: IncomeEvent): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(income.event_date)
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0,
    ).getTime()
  }
  return Date.parse(income.created_at)
}

/**
 * Construye la meta line bajo el section title: "3 gastos · 1 ingreso"
 * style. Pluralización en español + maneja 0 / 1 / N para cada side.
 * Skippea cuando ambos counts son cero (la section parent no renderea
 * en ese caso anyway).
 */
export function sectionMetaCopy(expenseCount: number, incomeCount: number): string {
  const parts: string[] = []
  if (expenseCount > 0) {
    parts.push(i18n.t('gastos:sectionMeta.expenses', { count: expenseCount }))
  }
  if (incomeCount > 0) {
    parts.push(i18n.t('gastos:sectionMeta.incomes', { count: incomeCount }))
  }
  if (parts.length === 0) return i18n.t('gastos:sectionMeta.none')
  return parts.join(' · ')
}

/** Etiqueta para una sección que existe solo por un income-event (sin
 *  expenses ese día). Coincide con el formato de `groupGastosByDay`. */
export function formatStandaloneIncomeDay(d: Date): string {
  return formatWeekdayDayMonth(d)
}

// ─── Helpers de calendario / ciclo ────────────────────────────────
export function getMondayFirstOffset(cycleStart: Date): number {
  const jsDow = cycleStart.getDay()
  return (jsDow + 6) % 7
}

export function startOfLocalDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

export function stepCycleDay(
  selected: number | null,
  cycleDates: Date[],
  today: Date,
  direction: 1 | -1,
): number | null {
  if (selected == null) return null
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return cycleDates[0]?.getDate() ?? null
  const todayMs = startOfLocalDay(today).getTime()
  const target = idx + direction
  if (target < 0 || target >= cycleDates.length) return selected
  const targetDate = cycleDates[target]
  if (!targetDate) return selected
  if (direction === 1 && targetDate.getTime() > todayMs) return selected
  return targetDate.getDate()
}

export function getCycleNavBounds(
  selected: number | null,
  cycleDates: Date[],
  today: Date,
): { canGoPrev: boolean; canGoNext: boolean } {
  if (selected == null) return { canGoPrev: false, canGoNext: false }
  const idx = cycleDates.findIndex((d) => d.getDate() === selected)
  if (idx === -1) return { canGoPrev: false, canGoNext: false }
  const todayMs = startOfLocalDay(today).getTime()
  const canGoPrev = idx > 0
  const nextDate = cycleDates[idx + 1]
  const canGoNext = Boolean(nextDate) && nextDate!.getTime() <= todayMs
  return { canGoPrev, canGoNext }
}

// ─── Helpers de row formatting ────────────────────────────────────
export function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function composeRowA11yLabel(args: {
  title: string
  categoryName: string
  whoName: string
  amount: number
  iso: string
}): string {
  const time = formatTime(args.iso)
  return i18n.t('gastos:movementRow.a11yLabel', {
    title: args.title,
    amount: args.amount,
    categoryName: args.categoryName,
    whoName: args.whoName,
    time,
  })
}
