import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'

export type FijoItemStatus = 'paid' | 'pending' | 'overdue'

export interface FijoItem extends FixedExpense {
  /** Day of the month (1..31) the item is due this cycle. */
  dayOfMonth: number
  /** Derived from payment records + today's date. */
  computedStatus: FijoItemStatus
  /** True if the item sits idle — flagged as zombie subscription, etc. */
  isZombie: boolean
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
  upcoming: FijoItem[] // next 3 pending by dayOfMonth >= today
  zombies: FijoItem[]
  daysToNextPayment: number | null
  todayDay: number
  daysInMonth: number
  daysRemaining: number
}

/**
 * Zombie detection — item whose amount hasn't moved in the last 3
 * cycles AND its monthly cost is below the "cheap but sneaky"
 * threshold (ARS 6000 by default). Matches the V1 Cuaderno mock's
 * intent without needing a dedicated column yet.
 */
function isLikelyZombie(item: FixedExpense, monthlyThreshold = 6000): boolean {
  const amount = Number(item.amount ?? 0)
  if (amount <= 0) return false
  if (item.kind !== 'recurring') return false
  if (item.status !== 'active') return false
  return amount <= monthlyThreshold
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
 * Builds the full cycle summary consumed by the Fijos ring hero.
 * Takes the raw items, the set of payments for the current period
 * (first-of-month), and today's date.
 */
export function summarizeFijos(input: {
  items: FixedExpense[]
  paymentsThisMonth: FixedExpensePayment[]
  today: Date
  zombieThreshold?: number
}): FijosCycleSummary {
  const { items, paymentsThisMonth, today, zombieThreshold } = input
  const paidIds = new Set(paymentsThisMonth.map((p) => p.fixedExpenseId))
  const todayDay = today.getUTCDate()
  const daysInMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const enriched: FijoItem[] = items
    .filter((i) => i.status === 'active' || i.status === 'paused')
    .map((i) => {
      const paidThisPeriod = paidIds.has(i.id)
      const dueDate = i.next_due_on ? new Date(i.next_due_on) : null
      const dayOfMonth = dueDate ? dueDate.getUTCDate() : 1
      return {
        ...i,
        dayOfMonth,
        computedStatus: computeItemStatus({ item: i, paidThisPeriod, today }),
        isZombie: isLikelyZombie(i, zombieThreshold),
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
  const upcoming = pendingItems
    .filter((i) => i.dayOfMonth >= todayDay)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
    .slice(0, 3)
  const zombies = enriched.filter((i) => i.isZombie)
  const daysToNextPayment = upcoming[0] ? Math.max(0, upcoming[0].dayOfMonth - todayDay) : null
  const daysRemaining = Math.max(0, daysInMonth - todayDay)

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
    daysToNextPayment,
    todayDay,
    daysInMonth,
    daysRemaining,
  }
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
