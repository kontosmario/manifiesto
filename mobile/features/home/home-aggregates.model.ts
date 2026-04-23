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

export interface MonthlyComparison {
  currentMonthTotal: number
  previousMonthTotal: number
  deltaAmount: number | null
  deltaPercent: number | null
  direction: 'up' | 'down' | 'flat'
  previousMonthLabel: string
}

const ES_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export function computeMonthlyComparison(input: { expenses: StreakExpense[]; today: Date }): MonthlyComparison {
  const y = input.today.getUTCFullYear()
  const m = input.today.getUTCMonth()
  const prevY = m === 0 ? y - 1 : y
  const prevM = m === 0 ? 11 : m - 1
  let current = 0
  let previous = 0
  for (const e of input.expenses) {
    const d = new Date(e.created_at)
    const ey = d.getUTCFullYear()
    const em = d.getUTCMonth()
    if (ey === y && em === m) current += e.price
    else if (ey === prevY && em === prevM) previous += e.price
  }
  const previousMonthLabel = ES_MONTHS[prevM]
  if (previous === 0) {
    return {
      currentMonthTotal: current,
      previousMonthTotal: 0,
      deltaAmount: null,
      deltaPercent: null,
      direction: 'flat',
      previousMonthLabel,
    }
  }
  const deltaAmount = current - previous
  const deltaPercent = (deltaAmount / previous) * 100
  const direction: 'up' | 'down' | 'flat' = deltaAmount > 0 ? 'up' : deltaAmount < 0 ? 'down' : 'flat'
  return { currentMonthTotal: current, previousMonthTotal: previous, deltaAmount, deltaPercent, direction, previousMonthLabel }
}
