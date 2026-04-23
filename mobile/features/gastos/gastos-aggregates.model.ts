import type { Expense } from '@/features/expenses/use-expenses'

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

/**
 * Ranks categories by total spend in the given expense window and
 * returns the top N with their share (%) of the total. Used by the
 * Gastos hero "MÁS PESO POR CATEGORÍA" section.
 */
export function computeCategoryWeights(
  expenses: Expense[],
  categories: CategoryLite[],
  topN = 3,
): CategoryWeightRow[] {
  if (expenses.length === 0) return []
  const total = expenses.reduce((sum, e) => sum + Math.abs(Number(e.price ?? 0)), 0)
  if (total <= 0) return []
  const byId = new Map<string, number>()
  for (const e of expenses) {
    const prev = byId.get(e.category_id) ?? 0
    byId.set(e.category_id, prev + Math.abs(Number(e.price ?? 0)))
  }
  const rows: CategoryWeightRow[] = []
  for (const [categoryId, amount] of byId) {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) continue
    rows.push({
      id: cat.id,
      label: cat.name,
      color: cat.color,
      amount,
      percent: Math.round((amount / total) * 100),
    })
  }
  rows.sort((a, b) => b.amount - a.amount)
  return rows.slice(0, topN)
}

export interface DailySpendRow {
  day: number // 1..31
  total: number
  count: number
}

/**
 * Aggregates expenses within a single month by calendar day. Days with
 * no expenses are omitted from the result — caller can treat missing
 * days as zero.
 */
export function computeDailySpend(
  expenses: Expense[],
  year: number,
  month: number, // 0-indexed like Date.getMonth
): Record<number, DailySpendRow> {
  const out: Record<number, DailySpendRow> = {}
  for (const e of expenses) {
    const d = new Date(e.created_at)
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) continue
    const day = d.getUTCDate()
    const prev = out[day]
    const amount = Math.abs(Number(e.price ?? 0))
    if (prev) {
      prev.total += amount
      prev.count += 1
    } else {
      out[day] = { day, total: amount, count: 1 }
    }
  }
  return out
}

export type GastosDayMood = 'green' | 'amber' | 'red' | 'empty'

/**
 * Derives a "mood" color for each calendar day based on the month's
 * running daily average. Matches the heatmap in the Gastos mock:
 *   < avg*1.3  → green
 *   ≤ avg*2.0  → amber
 *   > avg*2.0  → red
 *   = 0        → empty
 */
export function computeGastosDayMoods(input: {
  dailySpend: Record<number, DailySpendRow>
  today: Date
}): Record<number, GastosDayMood> {
  const { dailySpend, today } = input
  const todayDay = today.getUTCDate()
  const totalSoFar = Object.values(dailySpend).reduce((s, r) => s + r.total, 0)
  const daysElapsed = Math.max(1, todayDay)
  const dailyAvg = totalSoFar / daysElapsed
  const amberThreshold = dailyAvg * 1.3
  const redThreshold = dailyAvg * 2.0
  const out: Record<number, GastosDayMood> = {}
  for (let day = 1; day <= todayDay; day++) {
    const spend = dailySpend[day]?.total ?? 0
    if (spend === 0) out[day] = 'empty'
    else if (spend >= redThreshold) out[day] = 'red'
    else if (spend >= amberThreshold) out[day] = 'amber'
    else out[day] = 'green'
  }
  return out
}

export interface RegistrationStreakInput {
  expenses: Expense[]
  today: Date
}

/**
 * How many consecutive days (counting back from today) the user has
 * registered at least one expense. Powers the "RACHA DE REGISTRO"
 * insight card on Gastos.
 */
export function computeRegistrationStreak(input: RegistrationStreakInput): number {
  const { expenses, today } = input
  if (expenses.length === 0) return 0
  const days = new Set<string>()
  for (const e of expenses) {
    const d = new Date(e.created_at)
    days.add(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  let streak = 0
  const cursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
    if (!days.has(key)) break
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (streak > 366) break
  }
  return streak
}

export interface AverageDailySpendInput {
  expenses: Expense[]
  today: Date
  windowDays?: number
}

/**
 * Mean daily expense over the last N days (default 22 to match the
 * mock). Days with zero spend count as zero.
 */
export function computeAverageDailySpend(input: AverageDailySpendInput): number {
  const { expenses, today, windowDays = 22 } = input
  if (expenses.length === 0 || windowDays <= 0) return 0
  const startMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - (windowDays - 1),
  )
  let total = 0
  for (const e of expenses) {
    const t = new Date(e.created_at).getTime()
    if (t >= startMs && t <= today.getTime()) {
      total += Math.abs(Number(e.price ?? 0))
    }
  }
  return Math.round(total / windowDays)
}

/**
 * Returns the spend per day for the last N calendar days (oldest
 * first, newest last). Normalized by the max so every value sits in
 * [0, 1] — ready for a mini bar chart. Days with no spend come back
 * as 0 so the caller can render them as "dashes".
 */
export function computeRecentDailyBars(input: {
  expenses: Expense[]
  today: Date
  windowDays?: number
}): number[] {
  const { expenses, today, windowDays = 7 } = input
  if (windowDays <= 0) return []
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  const totals = new Array<number>(windowDays).fill(0)
  for (const e of expenses) {
    const d = new Date(e.created_at)
    const dUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    const diffDays = Math.round((todayUtc - dUtc) / 86_400_000)
    if (diffDays < 0 || diffDays >= windowDays) continue
    const idx = windowDays - 1 - diffDays
    totals[idx] += Math.abs(Number(e.price ?? 0))
  }
  const max = Math.max(...totals)
  if (max <= 0) return totals
  return totals.map((t) => t / max)
}

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
 * Groups expenses by day with human labels ("Hoy", "Ayer", "lun 19 abr").
 * Groups are sorted newest-first.
 */
export function groupGastosByDay(input: { expenses: Expense[]; today: Date }): GastosGroup[] {
  const { expenses, today } = input
  const map = new Map<string, { day: number; items: Expense[]; total: number; sortKey: number }>()
  for (const e of expenses) {
    const d = new Date(e.created_at)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const prev = map.get(key)
    const amount = Math.abs(Number(e.price ?? 0))
    if (prev) {
      prev.items.push(e)
      prev.total += amount
    } else {
      map.set(key, {
        day: d.getUTCDate(),
        items: [e],
        total: amount,
        sortKey: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      })
    }
  }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const groups: GastosGroup[] = []
  for (const [key, value] of map) {
    const dayMs = value.sortKey
    const diffDays = Math.round((todayUtc - dayMs) / 86_400_000)
    let label: string
    if (diffDays === 0) label = 'Hoy'
    else if (diffDays === 1) label = 'Ayer'
    else {
      const d = new Date(dayMs)
      label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    }
    groups.push({ label, day: value.day, total: value.total, items: value.items })
    void key
  }
  groups.sort((a, b) => b.items[0].created_at.localeCompare(a.items[0].created_at))
  return groups
}
