import i18n from '@/lib/i18n'
import type { Expense } from '@/features/expenses/expense-repository.model'
import type { FixedExpense, FixedExpenseFrequency } from '@/features/fixed-expenses/fixed-expense-types'
import {
  isOptimisticPaymentId,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/fixed-expense-payment.model'
import { advanceFixedExpenseDueDate } from '@/features/fixed-expenses/commitment-date-utils'

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
  /** Días calendario reales hasta `next_due_on` (diferencia de fechas,
   *  no aritmética de day_of_month). Clamp a 0 — un vencido "toca
   *  ahora", no envuelve al próximo ciclo. */
  daysUntilDue: number
  /** Cuotas vencidas acumuladas (0 salvo overdue; ≥1 ahí). Cada pago
   *  salda la más vieja y decrementa. Es el conteo crudo de
   *  `computeMissedCuotas` ajustado por `capMissedCuotas` a lo que el
   *  backend realmente permite cobrar: nunca > 1 en pausados ni en
   *  weekly/biweekly (identidad de cuota mensual del ledger), y nunca
   *  más de lo que queda del plan (installments/remaining_balance/
   *  ends_on). Ver ambas funciones en este archivo. */
  missedCuotas: number
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
  /** Precio contra el que `trendDeltaPct` está comparando `amount`.
   *  Usa la misma selección dual-mode que `trendDeltaPct`:
   *    · Si el último pago histórico coincide con `amount` (just-paid /
   *      paid-at-current-price), el "prev" relevante es el penúltimo.
   *    · Sino, es el último pago histórico.
   *  Lo consumen los avisos de hike para renderizar
   *  `previousPrice → currentPrice` sin caer en el bug de mostrar
   *  `current → current` cuando ya hubo un pago al precio nuevo. Null
   *  cuando no hay historial suficiente para comparar. */
  trendPrevAmount: number | null
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
 * Translates next_due_on + payment record + today + ciclo activo into a status:
 *   overdue  → next_due_on < HOY (gana sobre todo lo demás, incluso un
 *              payment en el ciclo — ver v5 en la Historia).
 *   paid     → payment record para este ciclo, con next_due_on ya en
 *              el presente/futuro O cycle covered by prior payment
 *              (next_due_on >= cycleEnd AND last_paid_at != null) —
 *              caso "ya pagué este fijo, próxima cuota cae después
 *              del ciclo".
 *   future   → next_due_on >= cycleEnd Y last_paid_at == null →
 *              fijo creado recién, sin pagos, próxima cuota lejana.
 *   pending  → next_due_on cae entre HOY y cycleEnd → cuota toca, no
 *              venció.
 *
 * Historia:
 *
 *   v1 (pre-2026-05-30): solo `next_due_on < today` → overdue. Bug
 *   de recurrencia con trimestrales.
 *
 *   v2 (2026-05-30 inicial): `next_due_on < cycleStart` → overdue.
 *   Resolvió recurrencia pero rompió cuotas del ciclo activo ya
 *   vencidas (quedaban pending).
 *
 *   v3 (2026-05-30 refinado): `next_due_on < today` → overdue;
 *   `next_due_on >= cycleEnd` → future. Cubre los 2 casos pero
 *   ignora "cycle covered by past payment": fijos pagados
 *   anticipados con next_due_on que avanzó más allá del ciclo
 *   (ej: Claude pagado 13 mayo, next_due_on=21 junio, cycle activo
 *   termina 20 junio → quedaba como 'future' cuando el user lo
 *   percibía como 'paid').
 *
 *   v4 (2026-08-13): agrega la regla "cycle covered by prior
 *   payment". Si next_due_on >= cycleEnd Y last_paid_at != null →
 *   'paid' (el ciclo está cubierto por un pago previo, no hay cuota
 *   que toque en este ciclo). Solo cae a 'future' si NUNCA se pagó
 *   (fijo nuevo).
 *
 *   v5 (HOY): overdue gana sobre paid. Si `next_due_on` está en el
 *   pasado hay una cuota impaga AHORA, aunque exista un pago este
 *   ciclo (catch-up parcial: pagó la cuota más vieja y quedan más).
 *   Antes `paidThisPeriod` ganaba y la deuda restante quedaba
 *   invisible e impagable hasta el próximo ciclo.
 */
function computeItemStatus(input: {
  item: FixedExpense
  paidThisPeriod: boolean
  today: Date
  cycleEnd: Date
}): FijoItemStatus {
  const { item, paidThisPeriod, today, cycleEnd } = input
  // Comparamos en UTC midnight — el `next_due_on` viene como
  // 'YYYY-MM-DD' del DB sin TZ; `today` se normaliza a midnight local
  // pero usamos getUTC* para comparar como fechas calendario puras.
  // Hoisteados arriba de todo: los usan tanto el check de overdue (v5,
  // primero) como el resto de la función — una sola definición, sin
  // recomputar ni divergir.
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  const due = item.next_due_on ? new Date(item.next_due_on) : null
  const dueUtc = due ? Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) : null
  // v5: OVERDUE GANA SOBRE PAID. Si `next_due_on` está en el pasado hay
  // una cuota impaga AHORA, aunque exista un pago este ciclo (catch-up
  // parcial: pagó la cuota más vieja y quedan más). Antes `paidThisPeriod`
  // ganaba y la deuda restante quedaba invisible e impagable hasta el
  // próximo ciclo.
  if (dueUtc != null && dueUtc < todayUtc) return 'overdue'
  if (paidThisPeriod) return 'paid'
  if (dueUtc == null) return 'pending'
  const endUtc = Date.UTC(
    cycleEnd.getUTCFullYear(),
    cycleEnd.getUTCMonth(),
    cycleEnd.getUTCDate(),
  )
  // 2) Vencimiento cae en un ciclo posterior.
  //    Si hay last_paid_at (fijo ya pagado al menos una vez) → 'paid':
  //    el ciclo activo está cubierto por el pago previo, la próxima
  //    cuota cae después del ciclo. Si nunca se pagó → 'future'
  //    (típicamente fijo recién creado con next_due_on en futuro).
  if (dueUtc >= endUtc) {
    return item.last_paid_at ? 'paid' : 'future'
  }
  // 3) Vencimiento entre HOY y cycleEnd → pending (toca este ciclo,
  //    todavía no venció).
  return 'pending'
}

/**
 * Cuántas cuotas vencidas acumula un fijo: itera desde `nextDueOn`
 * con el espejo de advance mientras la fecha sea < hoy. `periods` =
 * meses YYYY-MM-01 de cada cuota vencida (vieja → nueva) — la misma
 * identidad que usa `record_fixed_expense_payment` (period_month =
 * mes del vencimiento). Cap defensivo de 24 iteraciones.
 *
 * `endsOn` (FIX 3c, opcional) corta la cadena en seco cuando el
 * vencimiento de una cuota supera el fin del plan del compromiso —
 * como la iteración avanza cronológicamente, basta con cortar ahí:
 * ninguna cuota posterior puede caer antes de `endsOn`. Omitido/null
 * preserva el comportamiento anterior (sin techo).
 */
export function computeMissedCuotas(input: {
  nextDueOn: string | null
  frequency: FixedExpenseFrequency
  dayOfMonth: number | null
  today: Date
  endsOn?: string | null
}): { count: number; periods: string[] } {
  const { nextDueOn, frequency, dayOfMonth, today, endsOn = null } = input
  if (!nextDueOn) return { count: 0, periods: [] }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const endsOnDate = endsOn ? new Date(endsOn) : null
  const endsOnUtc = endsOnDate
    ? Date.UTC(endsOnDate.getUTCFullYear(), endsOnDate.getUTCMonth(), endsOnDate.getUTCDate())
    : null
  const periods: string[] = []
  let cursor = nextDueOn
  for (let i = 0; i < 24; i++) {
    const d = new Date(cursor)
    const dueUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (Number.isNaN(dueUtc) || dueUtc >= todayUtc) break
    if (endsOnUtc != null && dueUtc > endsOnUtc) break
    periods.push(`${cursor.slice(0, 7)}-01`)
    cursor = advanceFixedExpenseDueDate(cursor, frequency, dayOfMonth)
  }
  return { count: periods.length, periods }
}

/**
 * Ajusta el conteo crudo de `computeMissedCuotas` a lo que el backend
 * REALMENTE permite cobrar. Tres gates independientes, cada uno solo
 * puede achicar el conteo (nunca agrandarlo), con piso 1 — un fijo
 * `overdue` siempre debe al menos su cuota actual:
 *
 *   1) FIX 4 — compromiso pausado: `record_fixed_expense_payment`
 *      exige `status = 'active'`. Un pausado vencido no es pagable en
 *      absoluto ahora mismo, así que "debe N cuotas" es una promesa
 *      que ningún botón puede cumplir → cuenta como 1.
 *   2) FIX 1 — identidad de cuota del ledger: `fixed_expense_payments`
 *      tiene `unique(fixed_expense_id, period_month)` y la RPC estampa
 *      `period_month = date_trunc('month', next_due_on)`. weekly y
 *      biweekly pueden vencer 2+ veces en el MISMO mes calendario, pero
 *      el backend no deja coexistir dos pagos de ese mes — el segundo
 *      intento revienta con `payment-already-recorded`. monthly/
 *      quarterly/semiannual/annual no tienen el problema: sus cuotas
 *      consecutivas siempre caen en meses distintos.
 *   3) FIX 3 — techo del plan: un installment no puede deber más que
 *      `installments_total - installments_paid` (lo que queda por
 *      pagar); un debt no puede deber más de lo que cubre
 *      `remaining_balance` (la RPC paga `least(amount, remaining_balance)`
 *      por pago, así que ninguna cuota más allá de ese punto es cobrable).
 */
function capMissedCuotas(item: FixedExpense, rawCount: number): number {
  if (item.status !== 'active') return 1
  if (item.frequency === 'weekly' || item.frequency === 'biweekly') return 1

  let count = rawCount
  if (item.kind === 'installment' && item.installments_total != null) {
    const remaining = Math.max(0, item.installments_total - item.installments_paid)
    count = Math.min(count, remaining)
  }
  if (item.kind === 'debt' && item.remaining_balance != null) {
    const amount = Number(item.amount ?? 0)
    if (amount > 0) count = Math.min(count, Math.floor(item.remaining_balance / amount))
  }
  return Math.max(1, count)
}

/**
 * Días calendario reales entre HOY y `next_due_on` (UTC midnight,
 * mismo criterio que computeItemStatus). Clamp a 0: un vencido "toca
 * ahora" — el tag 'VENCIDO' del ticker se decide por status, no por
 * este número. Reemplaza la aritmética por day_of_month + wrap, que
 * mentía en frecuencias no mensuales y nunca superaba 31.
 */
function daysUntilDueFromDate(nextDueOn: string | null, today: Date): number {
  if (!nextDueOn) return 0
  const due = new Date(nextDueOn)
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (Number.isNaN(dueUtc)) return 0
  return Math.max(0, Math.round((dueUtc - todayUtc) / 86_400_000))
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
  /** Inicio de la ventana mensual de accounting (inclusive). Para
   *  monthly users coincide con `payCycle.start`; para non-monthly es
   *  el primer día del mes calendario. Lo usa la clasificación
   *  paid/pending/overdue/future del row. */
  monthlyStart: Date
  /** Fin de la ventana mensual de accounting (exclusive). Necesario
   *  para gating "no toca este mes" vs "vence en este mes". Antes
   *  recibíamos `cycleStart`/`cycleEnd`/`cycleDays` desde `usePayCycle`;
   *  ahora son las bounds del plano mensual fijo. */
  monthlyEnd: Date
  monthlyDays: number
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
    monthlyStart,
    monthlyEnd,
    monthlyDays,
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
      monthlyDays,
      Math.floor((todayStartOfDay.getTime() - monthlyStart.getTime()) / msPerDay) + 1,
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
      // `prev` semantics: the price we compare `currentAmount` against
      // when computing the trend delta. Two cases coexist on a fijo
      // depending on whether the user has paid at the current price
      // yet:
      //
      //   1. **Pending price change** — fijo.amount was updated (via
      //      the editor or RPC override) but the user hasn't recorded
      //      a payment at that new price yet. `currentAmount` ≠ last
      //      historical payment → compare against the last payment so
      //      the badge reads "+X% pending since last payment".
      //
      //   2. **Just paid** — the most recent payment was recorded at
      //      `currentAmount` (the RPC sets fijo.amount to the override
      //      AND inserts an expense at that price). The last entry in
      //      `historyPrices` equals `currentAmount`. The user wants to
      //      see "+X% vs prior payment" on the row, not 0% — so we
      //      compare against the PENULTIMATE historical payment.
      //
      // Threshold for "matches the last payment": within $1 to absorb
      // floating-point noise on percentage overrides.
      const lastPaymentPrice = historyPrices[historyPrices.length - 1] ?? null
      const penultimatePaymentPrice = historyPrices[historyPrices.length - 2] ?? null
      const isJustPaid =
        lastPaymentPrice != null &&
        Math.abs(currentAmount - lastPaymentPrice) < 1
      const prev = isJustPaid ? penultimatePaymentPrice : lastPaymentPrice
      const trendDeltaPct =
        prev != null && prev > 0 && currentAmount > 0
          ? Math.round(((currentAmount - prev) / prev) * 100)
          : null
      const trendPrevAmount = prev != null && prev > 0 ? prev : null
      const status = computeItemStatus({
        item: i,
        paidThisPeriod,
        today,
        cycleEnd: monthlyEnd,
      })
      const missed =
        status === 'overdue'
          ? computeMissedCuotas({
              nextDueOn: i.next_due_on,
              frequency: i.frequency,
              dayOfMonth: i.day_of_month ?? null,
              today,
              endsOn: i.ends_on,
            })
          : { count: 0, periods: [] }
      const payment = paymentByFixedExpense.get(i.id) ?? null
      // cuotaMonth: qué cuota cubre/toca este row.
      //   · paid con payment en cycle → period_month del payment
      //     (cuota recién cubierta).
      //   · paid via coverage (next_due_on >= cycleEnd + last_paid_at):
      //     derivar period_month de la cuota PREVIA al next_due_on
      //     (next_due_on - 1 frequency). Ej: Claude next_due_on=jun/21
      //     monthly → cuota cubierta = may/21 → cuotaMonth=may.
      //   · pending/overdue/future sin payment en cycle → mes del
      //     next_due_on (cuota que toca o tocó).
      const cuotaMonth = (() => {
        if (status === 'paid' && payment) {
          return payment.periodMonth.slice(0, 7) + '-01'
        }
        if (status === 'paid' && !payment) {
          // Paid-via-coverage: la cuota cubierta es la PREVIA al
          // next_due_on actual.
          const prev = previousCuotaPeriodMonth(i)
          if (prev) return prev
        }
        return i.next_due_on ? i.next_due_on.slice(0, 7) + '-01' : null
      })()
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
        daysUntilDue: daysUntilDueFromDate(i.next_due_on, today),
        computedStatus: status,
        missedCuotas: status === 'overdue' ? capMissedCuotas(i, missed.count) : 0,
        isZombie: false,
        daysSinceLastPaid,
        priceHistory,
        trendDeltaPct,
        trendPrevAmount,
        arrearsOnLastPayment: arrearsByCommitment.get(i.id) === true,
        // Only expose a *revertable* payment id: during the optimistic window
        // `payment.id` is the synthetic `optimistic-…` string, which would 22P02
        // the revert RPC (uuid param). Null until the real server row lands.
        paidPaymentId:
          status === 'paid' && payment && !isOptimisticPaymentId(payment.id)
            ? payment.id
            : null,
        cuotaMonth,
        annualCost,
        pctOfIncome,
        paymentsLifetime,
        totalPaidLifetime: lifetime.total,
      }
    })

  const paidItems = enriched.filter((i) => i.computedStatus === 'paid')
  const pendingItems = enriched.filter((i) => i.computedStatus === 'pending')
  const overdueItems = enriched.filter((i) => i.computedStatus === 'overdue')
  const futureItems = enriched.filter((i) => i.computedStatus === 'future')
  const paidAmount = paidItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const pendingAmount = pendingItems.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const overdueAmount = overdueItems.reduce(
    (s, i) => s + Number(i.amount ?? 0) * Math.max(1, i.missedCuotas),
    0,
  )
  // FIX 2: `total` es la suma de sus 3 partes, contando el vencido con sus
  // cuotas — no el fijo una sola vez. Antes `total` recorría `cycleActive`
  // (cada fijo UNA vez) mientras `overdueAmount` ya multiplicaba por
  // `missedCuotas`: con deuda multi-cuota el vencido superaba al total
  // ("POR PAGAR $15.000 … de $5.000 en total") y `overduePct` pasaba de
  // 100. `future` sigue excluido (ninguna de las 3 partes lo incluye) —
  // el ring del hero y la "% del sueldo" reflejan solo el ciclo activo.
  const total = paidAmount + pendingAmount + overdueAmount
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
  const daysRemaining = Math.max(0, monthlyDays - cycleDayIndex)

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
    cycleDays: monthlyDays,
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
    // `trendPrevAmount` ya aplica la selección dual-mode (penúltimo
    // cuando el último pago coincide con el currentAmount). Usar
    // `priceHistory[length - 2]` ciego rompía cuando había un pago
    // al precio actual — devolvía `currentAmount` como "previous" y
    // el aviso renderizaba "$X → $X" con un delta % desconectado.
    const previousPrice = item.trendPrevAmount
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
 * Para un fijo en estado "paid-via-coverage" (status='paid' sin un
 * payment record en el cycle activo), deriva el `period_month` (YYYY-MM-01)
 * de la cuota cubierta = `next_due_on - 1 frequency`.
 *
 * Ej: Claude next_due_on=2026-06-21 monthly → previa = 2026-05-21 →
 * cuotaMonth = '2026-05-01'. El user ve "Mayo · pagada", que
 * corresponde a la cuota real cubierta por el pago del 13 mayo.
 *
 * Para frequencies week-based (weekly, biweekly) el concepto de
 * "period month" es menos limpio — devolvemos el mes del next_due_on
 * shift back por la cantidad de days correspondiente.
 */
function previousCuotaPeriodMonth(item: FixedExpense): string | null {
  if (!item.next_due_on) return null
  const due = new Date(item.next_due_on)
  switch (item.frequency) {
    case 'weekly':
      due.setUTCDate(due.getUTCDate() - 7)
      break
    case 'biweekly':
      due.setUTCDate(due.getUTCDate() - 14)
      break
    case 'monthly':
      due.setUTCMonth(due.getUTCMonth() - 1)
      break
    case 'quarterly':
      due.setUTCMonth(due.getUTCMonth() - 3)
      break
    case 'semiannual':
      due.setUTCMonth(due.getUTCMonth() - 6)
      break
    case 'annual':
      due.setUTCFullYear(due.getUTCFullYear() - 1)
      break
    default:
      due.setUTCMonth(due.getUTCMonth() - 1)
  }
  const iso = due.toISOString().slice(0, 7) // YYYY-MM
  return `${iso}-01`
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
  /** Label A MOSTRAR (localizado). Header del grupo. */
  label: string
  /**
   * Nombre CRUDO (no localizado) de la categoría — fuente para resolver
   * el ícono del grupo (matcher ES). Cae a `label` cuando no hay crudo.
   */
  rawLabel: string
  color: string
  total: number
  items: FijoItem[]
}

/** Orden cronológico por vencimiento: timestamp de `next_due_on`. Los
 *  ítems sin fecha válida van al final. */
function dueOrder(i: FijoItem | undefined): number {
  if (!i || !i.next_due_on) return Number.MAX_SAFE_INTEGER
  const t = new Date(i.next_due_on).getTime()
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

export function groupFijosByCategory(input: {
  items: FijoItem[]
  // `name` = display localizado (header); `rawName` = crudo ES (ícono).
  categories: Array<{ id: string; name: string; rawName?: string; color: string }>
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
    const label = cat?.name ?? i18n.t('fijos:groups.noCategory')
    groups.push({
      categoryId: id,
      label,
      // Crudo para el ícono; cae al display localizado si no hay crudo.
      rawLabel: cat?.rawName ?? label,
      color: cat?.color ?? '#8A8A8A',
      total: arr.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      // Cronológico: el próximo a vencer primero (next_due_on real, no
      // dayOfMonth — que se rompe cuando los fijos cruzan de mes).
      items: arr.sort((a, b) => dueOrder(a) - dueOrder(b)),
    })
  }
  // Los grupos también por vencimiento más próximo (items[0] es el más
  // próximo tras el sort interno) → el próximo a vencer queda arriba de
  // todo. Empate → la categoría con más monto primero.
  groups.sort(
    (a, b) => dueOrder(a.items[0]) - dueOrder(b.items[0]) || b.total - a.total,
  )
  return groups
}
