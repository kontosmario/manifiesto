export interface StreakExpense {
  price: number
  created_at: string
}

export interface ComputeNoExcessStreakInput {
  expenses: StreakExpense[]
  dailyBudget: number | null
  today: Date
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function computeNoExcessStreak(input: ComputeNoExcessStreakInput): number {
  if (input.dailyBudget == null || input.dailyBudget <= 0) return 0
  if (input.expenses.length === 0) return 0

  const totals = new Map<string, number>()
  for (const e of input.expenses) {
    const k = utcDayKey(new Date(e.created_at))
    totals.set(k, (totals.get(k) ?? 0) + e.price)
  }

  let streak = 0
  const cursor = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate()))
  while (true) {
    const key = utcDayKey(cursor)
    const total = totals.get(key) ?? 0
    if (total > input.dailyBudget) break
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (streak > 366) break
  }
  return streak
}

export type DayMood = 'green' | 'amber' | 'red'

export interface ComputeMonthDailyMoodInput {
  expenses: StreakExpense[]
  dailyBudget: number | null
  today: Date
}

export function computeMonthDailyMood(input: ComputeMonthDailyMoodInput): Record<number, DayMood> {
  const out: Record<number, DayMood> = {}
  if (input.dailyBudget == null || input.dailyBudget <= 0) return out
  const year = input.today.getUTCFullYear()
  const month = input.today.getUTCMonth()
  const todayDay = input.today.getUTCDate()
  const totals = new Map<number, number>()
  for (const e of input.expenses) {
    const dt = new Date(e.created_at)
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month) continue
    const d = dt.getUTCDate()
    if (d > todayDay) continue
    totals.set(d, (totals.get(d) ?? 0) + e.price)
  }
  for (const [day, total] of totals) {
    if (total <= input.dailyBudget) out[day] = 'green'
    else if (total <= input.dailyBudget * 1.2) out[day] = 'amber'
    else out[day] = 'red'
  }
  return out
}
