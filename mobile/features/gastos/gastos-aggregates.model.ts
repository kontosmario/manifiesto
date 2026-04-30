import type { Expense } from '@/features/expenses/use-expenses'

// ─── Types still consumed by the controller / endpoints ─────────────
//
// Pre-arquitectura v2, este módulo concentraba toda la lógica de
// agregación client-side. Esa lógica ahora vive en las RPCs
// `gastos_*` (ver migration 20260505000000). Lo único que sobrevive
// es:
//
//   • `groupGastosByDay` — el server retorna rows planas con
//     `iso_date`, pero el SectionList las consume agrupadas por día
//     con label humano ("Hoy" / "Ayer" / "lun 19 abr"). Esa lógica
//     sigue siendo client-side porque es presentational.
//
//   • Los tipos `CategoryLite`, `CategoryWeightRow`, `DailySpendRow`,
//     `DayOfMonthSpendRow`, `GastosDayMood`, `GastosGroup` — la API
//     pública del controller los expone tal cual.

export interface CategoryLite {
  id: string
  name: string
  color: string
}

export interface CategoryWeightRow {
  id: string
  label: string
  color: string
  amount: number
  percent: number
}

export interface DailySpendRow {
  /** ISO date `YYYY-MM-DD`. */
  isoDate: string
  /** Day-of-month (1..31). */
  day: number
  total: number
  count: number
}

export interface DayOfMonthSpendRow {
  day: number
  total: number
  count: number
}

export type GastosDayMood = 'green' | 'amber' | 'red' | 'empty'

export type GastosGroupLabel = 'Hoy' | 'Ayer' | string

export interface GastosGroup {
  label: GastosGroupLabel
  day: number
  total: number
  items: Expense[]
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Format a Date as a local-time `YYYY-MM-DD` string. Local — not
 * UTC — so a 22:00 ART expense is keyed under the day the user
 * actually was on, not the day UTC would assign.
 */
function localIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize a Date to local-midnight (mutates a fresh copy). */
function startOfLocalDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Groups expenses by local day with human labels ("Hoy", "Ayer",
 * "lun 19 abr"). Sorted newest-first.
 *
 * Used by the controller to convert the flat `expenses` list (sourced
 * from the paginated RPC or the day-detail RPC) into `GastosGroup[]`
 * for the SectionList sections.
 */
export function groupGastosByDay(input: { expenses: Expense[]; today: Date }): GastosGroup[] {
  const { expenses, today } = input
  interface Bucket {
    isoDate: string
    day: number
    items: Expense[]
    total: number
    sortKey: number
  }
  const map = new Map<string, Bucket>()
  for (const e of expenses) {
    const d = new Date(e.created_at)
    const iso = localIsoDate(d)
    const amount = Math.abs(Number(e.price ?? 0))
    const prev = map.get(iso)
    if (prev) {
      prev.items.push(e)
      prev.total += amount
    } else {
      map.set(iso, {
        isoDate: iso,
        day: d.getDate(),
        items: [e],
        total: amount,
        sortKey: startOfLocalDay(d).getTime(),
      })
    }
  }
  const todayMs = startOfLocalDay(today).getTime()
  const groups: GastosGroup[] = []
  for (const value of map.values()) {
    const diffDays = Math.round((todayMs - value.sortKey) / 86_400_000)
    let label: string
    if (diffDays === 0) label = 'Hoy'
    else if (diffDays === 1) label = 'Ayer'
    else {
      const d = new Date(value.sortKey)
      label = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
    }
    groups.push({ label, day: value.day, total: value.total, items: value.items })
  }
  groups.sort((a, b) => {
    const aMs = startOfLocalDay(new Date(a.items[0].created_at)).getTime()
    const bMs = startOfLocalDay(new Date(b.items[0].created_at)).getTime()
    return bMs - aMs
  })
  return groups
}
