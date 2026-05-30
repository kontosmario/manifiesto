import type { Expense } from '@/features/expenses/expense-repository.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'

/**
 * Estado de un fijo en el ciclo de pago activo:
 *   paid     → existe payment record para `fixedExpenseId` dentro del
 *              ciclo actual (mes calendario actual a nivel DB).
 *   pending  → `next_due_on` cae dentro de `[cycleStart, cycleEnd)`
 *              y no fue pagado todavía → toca pagar ESTE ciclo.
 *   overdue  → `next_due_on < cycleStart` (sin pago) → vencimiento de
 *              uno o más ciclos previos que arrastra como MORA y sigue
 *              visible en el listado principal hasta que se pague.
 *   future   → `next_due_on >= cycleEnd` (sin pago) → NO toca este
 *              ciclo (ej: trimestral pagado en abril, próx. julio).
 *              Vive en el tab "Pagados / Próximos", se oculta del
 *              tab "Pendientes".
 */
export type FijoItemStatus = 'paid' | 'pending' | 'overdue' | 'future'

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
  /** True cuando el último pago registrado para este commitment se hizo
   *  sobre un fijo VENCIDO (flag `expenses.paid_in_arrears = true`).
   *  Usado por la UI para distinguir el chip "Incremento con intereses"
   *  (subió y fue cobrado con mora) vs "Aumento de precio" (subió en
   *  pago normal). False cuando no hay historial o el último pago fue
   *  al día. */
  arrearsOnLastPayment: boolean
  /** Si `computedStatus === 'paid'`, el id del payment record que lo
   *  marca como pagado en este ciclo (lo usa el botón "Revertir
   *  pago" para invocar la RPC `revert_fixed_expense_payment`). Null
   *  en cualquier otro status (pending / overdue / future). */
  paidPaymentId: string | null
  /** Mes (date YYYY-MM-DD, día 1) que identifica la cuota relevante
   *  para este row:
   *    - paid       → period_month del payment de este ciclo (qué cuota cubre).
   *    - pending    → mes de `next_due_on` (la cuota que toca pagar).
   *    - overdue    → mes de `next_due_on` (la cuota que NO se pagó).
   *    - future     → mes de `next_due_on` (la próxima cuota que viene).
   *  Null si no se puede derivar (sin next_due_on y sin payment). */
  cuotaMonth: string | null
  /** Costo anualizado del fijo. Recurring: amount × frequency multiplier
   *  (52 weekly · 26 biweekly · 12 monthly · 4 quarterly · 2 semiannual
   *  · 1 annual). Installment: amount × installments_total (costo
   *  total de la deuda, no anual). Debt: remaining_balance (lo que
   *  todavía falta). 0 si no se puede derivar (frequency null, etc).
   *  Lo usa el expand panel para el "se lleva al año" — gancho
   *  educativo principal del row expandido. */
  annualCost: number
  /** % del sueldo familiar mensual que este fijo representa
   *  (proporcionalmente por mes — para installments / recurring
   *  no-monthly, normalizamos a equivalente mensual). Null cuando
   *  `monthlyIncome <= 0` (no hay sueldo configurado). */
  pctOfIncome: number | null
  /** Cantidad de pagos LIFETIME registrados para este commitment
   *  (basado en expenses con commitment_id en la cache del snapshot
   *  — cap implícito por el LIMIT 120 del home_snapshot). Para
   *  installment usamos `installments_paid` que es más confiable. */
  paymentsLifetime: number
  /** Suma de prices LIFETIME pagados para este commitment. Mismo
   *  cap que paymentsLifetime. Lo usa el expand panel para mostrar
   *  "ya pagaste $X en total" — pone la suscripción en contexto. */
  totalPaidLifetime: number
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
  /** Fijos al día con próximo vencimiento en un ciclo futuro (no tocan
   *  este ciclo). Surge cuando el `next_due_on` cae fuera del ciclo
   *  actual — típicamente trimestral/semestral/anual ya pagado. Vive
   *  en el tab "Pagados / Próximos" junto con `paidItems`. */
  futureItems: FijoItem[]
  upcoming: FijoItem[] // next 3 unpaid, ordered by days-until-due (cycle-aware)
  zombies: FijoItem[]
  hikes: FijoHikeAlert[]
  daysToNextPayment: number | null
  todayDay: number
  cycleDays: number
  daysRemaining: number
}

const HIKE_MIN_DELTA_PCT = 5

// Legacy zombie heuristic removed in favor of the family-transparent
// audit flow surfaced in the Asesor (asistente). Detection now lives in
// `mobile/features/subscriptions-zombie/subscription-audit-engine.ts`.
// `FijoItem.isZombie` and `FijosCycleSummary.zombies` are kept as no-ops
// (always false / empty) so consumers don't break — to be removed when
// all UI surfaces migrate.

/**
 * Translates next_due_on + payment record + ciclo activo into a status:
 *   paid     → payment record para este ciclo
 *   pending  → next_due_on ∈ [cycleStart, cycleEnd), sin pago
 *   overdue  → next_due_on < cycleStart, sin pago → mora arrastrada
 *   future   → next_due_on >= cycleEnd, sin pago → no toca este ciclo
 *
 * Antes (pre-2026-05-30) la función comparaba contra `today` directo,
 * por lo que un trimestral pagado en abril seguía mostrándose como
 * pendiente en mayo y junio aunque `next_due_on = julio`. Con el
 * gating contra `cycleEnd`, "future" queda explícito y la UI lo
 * relega al tab "Pagados / Próximos".
 */
function computeItemStatus(input: {
  item: FixedExpense
  paidThisPeriod: boolean
  cycleStart: Date
  cycleEnd: Date
}): FijoItemStatus {
  const { item, paidThisPeriod, cycleStart, cycleEnd } = input
  if (paidThisPeriod) return 'paid'
  if (!item.next_due_on) return 'pending'
  // Comparamos en UTC midnight para evitar drift por zona horaria local
  // (el `next_due_on` viene como 'YYYY-MM-DD' del DB, sin TZ).
  const due = new Date(item.next_due_on)
  const dueUtc = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
  )
  const startUtc = Date.UTC(
    cycleStart.getUTCFullYear(),
    cycleStart.getUTCMonth(),
    cycleStart.getUTCDate(),
  )
  const endUtc = Date.UTC(
    cycleEnd.getUTCFullYear(),
    cycleEnd.getUTCMonth(),
    cycleEnd.getUTCDate(),
  )
  if (dueUtc < startUtc) return 'overdue'
  if (dueUtc >= endUtc) return 'future'
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
  /** End of the current pay cycle (exclusive). Required: necesario para
   *  gating "no toca este ciclo" vs "vence en este ciclo". Antes
   *  inferiamos esto sumando `cycleDays` a `cycleStart`; ahora lo
   *  recibimos explícito desde `usePayCycle` para evitar discrepancias
   *  de TZ entre el cómputo del controller y el de aggregates. */
  cycleEnd: Date
  cycleDays: number
  /** Sueldo mensual familiar — usado para calcular `pctOfIncome` por
   *  fijo. Opcional: si no se pasa (o es 0), pctOfIncome queda null. */
  monthlyIncome?: number
}): FijosCycleSummary {
  const {
    items,
    paymentsThisCycle,
    commitmentExpenses = [],
    categoriesById,
    today,
    cycleStart,
    cycleEnd,
    cycleDays,
    monthlyIncome = 0,
  } = input
  const paidIds = new Set(paymentsThisCycle.map((p) => p.fixedExpenseId))
  // Index payment-by-fixedExpenseId para resolver paidPaymentId y
  // cuotaMonth en O(1). Si hay múltiples payments en el ciclo para el
  // mismo fijo (no debería pasar por el UNIQUE constraint, pero
  // defense in depth), tomamos el más reciente por paidAt.
  const paymentByFixedExpense = new Map<string, FixedExpensePayment>()
  for (const p of paymentsThisCycle) {
    const existing = paymentByFixedExpense.get(p.fixedExpenseId)
    if (!existing || new Date(p.paidAt).getTime() > new Date(existing.paidAt).getTime()) {
      paymentByFixedExpense.set(p.fixedExpenseId, p)
    }
  }
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
  const arrearsByCommitment = buildArrearsOnLastPaymentMap(commitmentExpenses)
  // Aggregates lifetime (cap implícito por LIMIT 120 del home_snapshot).
  const lifetimeByCommitment = buildLifetimePaymentsMap(commitmentExpenses)

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
      const status = computeItemStatus({
        item: i,
        paidThisPeriod,
        cycleStart,
        cycleEnd,
      })
      const payment = paymentByFixedExpense.get(i.id) ?? null
      // cuotaMonth: para paid, el period_month del payment; para los
      // otros estados, el mes del next_due_on (la cuota que toca o tocó).
      const cuotaMonth =
        status === 'paid' && payment
          ? payment.periodMonth.slice(0, 7) + '-01'
          : i.next_due_on
            ? i.next_due_on.slice(0, 7) + '-01'
            : null
      const annualCost = computeAnnualCost(i)
      // Para pctOfIncome normalizamos el costo a "equivalente mensual"
      // y lo dividimos por monthlyIncome. Lo más comparable entre fijos
      // de distinta frecuencia (un semestral de $60.000 representa
      // ~$10.000/mes, no $60.000/mes).
      const monthlyEquivalent =
        i.kind === 'installment' || i.kind === 'debt'
          ? Number(i.amount ?? 0) // cuotas mensuales asumidas (frequency='monthly' por design)
          : annualCost / 12
      const pctOfIncome =
        monthlyIncome > 0 && monthlyEquivalent > 0
          ? Math.round((monthlyEquivalent / monthlyIncome) * 100)
          : null
      const lifetime = lifetimeByCommitment.get(i.id) ?? { count: 0, total: 0 }
      // Para installment, `installments_paid` es la fuente más confiable
      // del payment count (no depende del cap del snapshot).
      const paymentsLifetime =
        i.kind === 'installment'
          ? Math.max(lifetime.count, i.installments_paid ?? 0)
          : lifetime.count
      return {
        ...i,
        dayOfMonth,
        daysUntilDue: daysUntilDue(dayOfMonth, todayDay, cycleDays),
        computedStatus: status,
        isZombie: false,
        daysSinceLastPaid,
        priceHistory,
        trendDeltaPct,
        arrearsOnLastPayment: arrearsByCommitment.get(i.id) === true,
        paidPaymentId: status === 'paid' && payment ? payment.id : null,
        cuotaMonth,
        annualCost,
        pctOfIncome,
        paymentsLifetime,
        totalPaidLifetime: lifetime.total,
      }
    })

  // `total` ahora excluye los `future` — el ring del hero y la "% del
  // sueldo" deben reflejar solo el costo del ciclo activo (pagado +
  // pendiente + mora arrastrada). Antes incluía todos los activos —
  // sobrestimaba en familias con muchos trimestrales/anuales.
  const cycleActive = enriched.filter((i) => i.computedStatus !== 'future')
  const total = cycleActive.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const paidItems = enriched.filter((i) => i.computedStatus === 'paid')
  const pendingItems = enriched.filter((i) => i.computedStatus === 'pending')
  const overdueItems = enriched.filter((i) => i.computedStatus === 'overdue')
  const futureItems = enriched.filter((i) => i.computedStatus === 'future')
  const paidAmount = paidItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const pendingAmount = pendingItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const overdueAmount = overdueItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const paidPct = total > 0 ? Math.round((paidAmount / total) * 100) : 0
  const pendingPct = total > 0 ? Math.round((pendingAmount / total) * 100) : 0
  const overduePct = total > 0 ? Math.round((overdueAmount / total) * 100) : 0
  // Upcoming: next 3 unpaid items que tocan este ciclo. Ordenado por
  // days-until-due, wrap-around para que anchors antes-de-hoy surjan
  // como "EN Xd". Excluimos `future` (no aplica al ciclo).
  const upcoming = [...pendingItems, ...overdueItems]
    .slice()
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 3)
  const zombies: FijoItem[] = []
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
    futureItems,
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
 * Costo anualizado de un fijo, derivado de su `amount` × multiplier
 * según `frequency`. Para installment: costo total de la deuda
 * (amount × installments_total). Para debt: remaining_balance.
 * 0 cuando no se puede derivar (frequency null, amount 0, etc).
 */
function computeAnnualCost(item: FixedExpense): number {
  const amount = Number(item.amount ?? 0)
  if (amount <= 0) return 0
  if (item.kind === 'installment') {
    const total = Number(item.installments_total ?? 0)
    return total > 0 ? amount * total : 0
  }
  if (item.kind === 'debt') {
    return Number(item.remaining_balance ?? 0)
  }
  // Recurring / periodic — multiplier por frequency.
  switch (item.frequency) {
    case 'weekly': return amount * 52
    case 'biweekly': return amount * 26
    case 'monthly': return amount * 12
    case 'quarterly': return amount * 4
    case 'semiannual': return amount * 2
    case 'annual': return amount
    default: return amount * 12 // fallback a monthly
  }
}

/**
 * Lifetime payment aggregates por commitment, derivados de TODOS los
 * expenses con `commitment_id` en cache (no solo los últimos 5 que
 * `buildPriceHistoryMap` retiene). Cap implícito por el LIMIT 120 del
 * home_snapshot. Para usuarios con > 120 expenses + fijos viejos, los
 * counts/totals son un floor — la UI deja claro que es "historial
 * reciente", no "histórico total absoluto".
 */
function buildLifetimePaymentsMap(
  expenses: Expense[],
): Map<string, { count: number; total: number }> {
  const result = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    if (!e.commitment_id) continue
    const price = Number(e.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) continue
    const prev = result.get(e.commitment_id) ?? { count: 0, total: 0 }
    result.set(e.commitment_id, {
      count: prev.count + 1,
      total: prev.total + price,
    })
  }
  return result
}

/**
 * Para cada commitment, devuelve true si el último expense registrado
 * (más reciente por created_at) trae `paid_in_arrears = true`. La UI
 * lo usa para mostrar el chip "Incremento con intereses" cuando ese
 * pago también disparó un trend delta positivo. Indexa por
 * `commitment_id`; ausencia = no hay historial = false implícito.
 */
function buildArrearsOnLastPaymentMap(
  expenses: Expense[],
): Map<string, boolean> {
  const latest = new Map<string, Expense>()
  for (const e of expenses) {
    if (!e.commitment_id) continue
    const prev = latest.get(e.commitment_id)
    if (
      prev == null ||
      new Date(e.created_at).getTime() > new Date(prev.created_at).getTime()
    ) {
      latest.set(e.commitment_id, e)
    }
  }
  const result = new Map<string, boolean>()
  for (const [id, e] of latest) result.set(id, e.paid_in_arrears === true)
  return result
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
