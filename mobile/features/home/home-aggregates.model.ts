export interface StreakExpense {
  price: number
  created_at: string
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
