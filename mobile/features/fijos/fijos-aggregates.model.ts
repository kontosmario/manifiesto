import type { Expense } from '@/features/expenses/expense-repository.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'

export type FijoItemStatus = 'paid' | 'pending' | 'overdue'

export interface FijoItem extends FixedExpense {
  /** Day of the month (1..31) the item is due this cycle. */
  dayOfMonth: number
  /** Derived from payment records + today's date. */
  computedStatus: FijoItemStatus
  /** Whole days until this item is next due, clamped to [0, cycleDays]. */
  daysUntilDue: number
  /** True if the item sits idle — flagged as zombie subscription, etc. */
  isZombie: boolean
  /** Days since last_paid_at, or null if never paid. */
  daysSinceLastPaid: number | null
  /**
   * Recent price points for the sparkline, oldest → newest. Includes the
   * current `amount` as the rightmost point. Empty when there's no history.
   */
  priceHistory: number[]
  /** % change between the previous payment and current amount. Null when no history. */
  trendDeltaPct: number | null
}

export interface FijoHikeAlert {
  fixedExpenseId: string
  name: string
  previousPrice: number
  currentPrice: number
  deltaPct: number
  category?: { id: string; name: string; color: string }
}

export interface FijosCycleSummary {
  total: number
  paidAmount: number
  pendingAmount: number
  overdueAmount: number
  paidPct: number // 0..100
  pendingPct: number
  overduePct: number
  paidItems: FijoItem[]
  pendingItems: FijoItem[]
  overdueItems: FijoItem[]
  upcoming: FijoItem[] // next 3 unpaid, ordered by days-until-due (cycle-aware)
  zombies: FijoItem[]
  hikes: FijoHikeAlert[]
  daysToNextPayment: number | null
  todayDay: number
  cycleDays: number
  daysRemaining: number
}

const ZOMBIE_INACTIVITY_DAYS = 60
const ZOMBIE_MAX_AMOUNT = 15000
const HIKE_MIN_DELTA_PCT = 5

/**
 * Zombie detection — cheap recurring subscription (≤ ARS 15k) that
 * hasn't been paid in the last 60 days. Matches the V1 Cuaderno copy
 * ("Sin uso en 60 días. Podés revisar.") without needing a dedicated
 * usage signal.
 */
function isLikelyZombie(input: {
  item: FixedExpense
  daysSinceLastPaid: number | null
  today: Date
}): boolean {
  const { item, daysSinceLastPaid, today } = input
  const amount = Number(item.amount ?? 0)
  if (amount <= 0 || amount > ZOMBIE_MAX_AMOUNT) return false
  if (item.kind !== 'recurring') return false
  if (item.status !== 'active') return false

  const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0
  const ageDays = createdAt > 0 ? (today.getTime() - createdAt) / 86_400_000 : Infinity
  if (ageDays < ZOMBIE_INACTIVITY_DAYS) return false

  if (daysSinceLastPaid == null) return true
  return daysSinceLastPaid >= ZOMBIE_INACTIVITY_DAYS
}

/**
 * Translates next_due_on + last_paid_at + today into a fresh status:
 *   paid     → there's a payment record for the current period
 *   overdue  → next_due_on is before today and no payment yet
 *   pending  → otherwise
 */
function computeItemStatus(input: {
  item: FixedExpense
  paidThisPeriod: boolean
  today: Date
}): FijoItemStatus {
  const { item, paidThisPeriod, today } = input
  if (paidThisPeriod) return 'paid'
  if (!item.next_due_on) return 'pending'
  const due = new Date(item.next_due_on)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  if (dueUtc < todayUtc) return 'overdue'
  return 'pending'
}

/**
 * Days until this item is next due, respecting the pay-cycle wrap.
 * If the anchor day is past, counts forward to the same day next
 * cycle (HOY → 0, tomorrow → 1, etc.).
 */
function daysUntilDue(dayOfMonth: number, todayDay: number, cycleDays: number): number {
  if (dayOfMonth >= todayDay) return dayOfMonth - todayDay
  return cycleDays - todayDay + dayOfMonth
}

/**
 * Builds the full cycle summary consumed by the Fijos ring hero.
 * Takes the raw items, the payments made during the current pay
 * cycle, optional commitment-tagged expenses used to detect hikes,
 * today, and cycle geometry (cycleStart + cycleDays) so "days
 * remaining" reflects the user's payday, not the calendar month.
 */
export function summarizeFijos(input: {
  items: FixedExpense[]
  paymentsThisCycle: FixedExpensePayment[]
  commitmentExpenses?: Expense[]
  categoriesById?: Map<string, { id: string; name: string; color: string }>
  today: Date
  cycleStart: Date
  cycleDays: number
}): FijosCycleSummary {
  const {
    items,
    paymentsThisCycle,
    commitmentExpenses = [],
    categoriesById,
    today,
    cycleStart,
    cycleDays,
  } = input
  const paidIds = new Set(paymentsThisCycle.map((p) => p.fixedExpenseId))
  const todayDay = today.getDate()
  const msPerDay = 86_400_000
  const todayStartOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const cycleDayIndex = Math.max(
    1,
    Math.min(
      cycleDays,
      Math.floor((todayStartOfDay.getTime() - cycleStart.getTime()) / msPerDay) + 1,
    ),
  )

  const historyByCommitment = buildPriceHistoryMap(commitmentExpenses)

  const enriched: FijoItem[] = items
    .filter((i) => i.status === 'active' || i.status === 'paused')
    .map((i) => {
      const paidThisPeriod = paidIds.has(i.id)
      const dueDate = i.next_due_on ? new Date(i.next_due_on) : null
      const dayOfMonth = i.day_of_month ?? (dueDate ? dueDate.getUTCDate() : 1)
      const lastPaidAt = i.last_paid_at ? new Date(i.last_paid_at).getTime() : null
      const daysSinceLastPaid =
        lastPaidAt != null ? Math.floor((today.getTime() - lastPaidAt) / 86_400_000) : null
      const historyPrices = historyByCommitment.get(i.id) ?? []
      const currentAmount = Number(i.amount ?? 0)
      const priceHistory = [...historyPrices, currentAmount]
      const prev = historyPrices[historyPrices.length - 1]
      const trendDeltaPct =
        prev != null && prev > 0 && currentAmount > 0
          ? Math.round(((currentAmount - prev) / prev) * 100)
          : null
      return {
        ...i,
        dayOfMonth,
        daysUntilDue: daysUntilDue(dayOfMonth, todayDay, cycleDays),
        computedStatus: computeItemStatus({ item: i, paidThisPeriod, today }),
        isZombie: isLikelyZombie({ item: i, daysSinceLastPaid, today }),
        daysSinceLastPaid,
        priceHistory,
        trendDeltaPct,
      }
    })

  const total = enriched.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const paidItems = enriched.filter((i) => i.computedStatus === 'paid')
  const pendingItems = enriched.filter((i) => i.computedStatus === 'pending')
  const overdueItems = enriched.filter((i) => i.computedStatus === 'overdue')
  const paidAmount = paidItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const pendingAmount = pendingItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const overdueAmount = overdueItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const paidPct = total > 0 ? Math.round((paidAmount / total) * 100) : 0
  const pendingPct = total > 0 ? Math.round((pendingAmount / total) * 100) : 0
  const overduePct = total > 0 ? Math.round((overdueAmount / total) * 100) : 0
  // Upcoming: next 3 unpaid items in the cycle window (includes pending
  // + overdue). Ordered by days-until-due, wrapping into next month so
  // anchors before today surface as "EN Xd" rather than disappearing.
  const upcoming = [...pendingItems, ...overdueItems]
    .slice()
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 3)
  const zombies = enriched.filter((i) => i.isZombie)
  const hikes = detectHikes({ items: enriched, categoriesById })
  const daysToNextPayment = upcoming[0] ? upcoming[0].daysUntilDue : null
  const daysRemaining = Math.max(0, cycleDays - cycleDayIndex)

  return {
    total,
    paidAmount,
    pendingAmount,
    overdueAmount,
    paidPct,
    pendingPct,
    overduePct,
    paidItems,
    pendingItems,
    overdueItems,
    upcoming,
    zombies,
    hikes,
    daysToNextPayment,
    todayDay,
    cycleDays,
    daysRemaining,
  }
}

/**
 * Detects items whose current amount is higher than the most recent
 * logged payment. Triggers on +5% deltas.
 */
function detectHikes(input: {
  items: FijoItem[]
  categoriesById?: Map<string, { id: string; name: string; color: string }>
}): FijoHikeAlert[] {
  const { items, categoriesById } = input
  const alerts: FijoHikeAlert[] = []
  for (const item of items) {
    if (item.trendDeltaPct == null || item.trendDeltaPct < HIKE_MIN_DELTA_PCT) continue
    const history = item.priceHistory
    const previousPrice = history[history.length - 2]
    if (previousPrice == null || previousPrice <= 0) continue
    alerts.push({
      fixedExpenseId: item.id,
      name: item.name,
      previousPrice,
      currentPrice: Number(item.amount ?? 0),
      deltaPct: item.trendDeltaPct,
      category: item.category_id ? categoriesById?.get(item.category_id) : undefined,
    })
  }
  alerts.sort((a, b) => b.deltaPct - a.deltaPct)
  return alerts.slice(0, 3)
}

/**
 * Builds per-commitment chronological price history (oldest → newest)
 * from the `expenses` rows tagged with `commitment_id`. Capped at 6
 * most-recent points to keep the sparkline readable.
 */
function buildPriceHistoryMap(expenses: Expense[]): Map<string, number[]> {
  const MAX_POINTS = 5
  const byCommitment = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (!e.commitment_id) continue
    const list = byCommitment.get(e.commitment_id) ?? []
    list.push(e)
    byCommitment.set(e.commitment_id, list)
  }
  const result = new Map<string, number[]>()
  for (const [commitmentId, list] of byCommitment) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const prices = list
      .map((e) => Number(e.price ?? 0))
      .filter((p) => Number.isFinite(p) && p > 0)
      .slice(-MAX_POINTS)
    if (prices.length > 0) result.set(commitmentId, prices)
  }
  return result
}

/**
 * Groups fijos by category. Used for the per-category stacked list on
 * the Fijos screen. Categories are looked up from the caller's map.
 */
export interface FijoCategoryGroup {
  categoryId: string
  label: string
  color: string
  total: number
  items: FijoItem[]
}

export function groupFijosByCategory(input: {
  items: FijoItem[]
  categories: Array<{ id: string; name: string; color: string }>
}): FijoCategoryGroup[] {
  const { items, categories } = input
  const byCat = new Map<string, FijoItem[]>()
  for (const i of items) {
    const key = i.category_id ?? 'sin-categoria'
    const prev = byCat.get(key) ?? []
    prev.push(i)
    byCat.set(key, prev)
  }
  const groups: FijoCategoryGroup[] = []
  for (const [id, arr] of byCat) {
    const cat = categories.find((c) => c.id === id)
    groups.push({
      categoryId: id,
      label: cat?.name ?? 'Sin categoría',
      color: cat?.color ?? '#8A8A8A',
      total: arr.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      items: arr.sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    })
  }
  groups.sort((a, b) => b.total - a.total)
  return groups
}
