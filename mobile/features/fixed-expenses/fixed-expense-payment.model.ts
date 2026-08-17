export interface FixedExpensePaymentRow {
  id: string
  fixed_expense_id: string
  period_month: string // YYYY-MM-DD
  paid_at: string
  paid_by: string
  created_at: string
  /** Link al expense row generado por la RPC `record_fixed_expense_payment`.
   *  Persiste el 1-a-1 explicito payment ↔ expense que antes era inferible
   *  por timestamp proximity. Lo usa la RPC `revert_fixed_expense_payment`
   *  para hacer rollback atómico. Nullable: NULL para rows pre-migración
   *  20260530180000 que el backfill no pudo linkear. */
  expense_id?: string | null
}

export interface FixedExpensePayment {
  id: string
  fixedExpenseId: string
  periodMonth: string
  paidAt: string
  paidBy: string
  createdAt: string
  /** Link al expense row generado. NULL para rows legacy sin backfill. */
  expenseId: string | null
}

/**
 * The record-payment mutation seeds the cache with a synthetic optimistic
 * payment row keyed `optimistic-<iso>-<fixedExpenseId>` (see use-fixed-expenses.ts)
 * until the real server row lands. That id is NOT a uuid, so it must never be
 * passed to `revert_fixed_expense_payment(p_payment_id uuid)` (→ 22P02) nor
 * surfaced as a revertable payment id. Single source of truth for the check.
 */
export function isOptimisticPaymentId(id: string): boolean {
  return id.startsWith('optimistic-')
}

interface RevertablePaymentScanParams {
  paymentLists: ReadonlyArray<
    | ReadonlyArray<Pick<FixedExpensePayment, 'id' | 'fixedExpenseId' | 'paidAt'>>
    | undefined
  >
  fixedExpenseId: string
  windowStartIso: string
  windowEndIso: string
}

/** Itera los pagos REALES del fijo con `paidAt` dentro de la ventana
 *  half-open `[windowStartIso, windowEndIso)` — la misma semántica del
 *  fetch (`useFixedExpensePayments`). Base compartida del pick y el
 *  snapshot de conocidos. */
function* iterateRevertablePayments(
  params: RevertablePaymentScanParams,
): Generator<{ id: string; paidAtMs: number }> {
  const windowStart = new Date(params.windowStartIso).getTime()
  const windowEnd = new Date(params.windowEndIso).getTime()
  for (const list of params.paymentLists) {
    if (!Array.isArray(list)) continue
    for (const payment of list) {
      if (payment.fixedExpenseId !== params.fixedExpenseId) continue
      if (isOptimisticPaymentId(payment.id)) continue
      const paidAtMs = new Date(payment.paidAt).getTime()
      if (!Number.isFinite(paidAtMs)) continue
      if (paidAtMs < windowStart || paidAtMs >= windowEnd) continue
      yield { id: payment.id, paidAtMs }
    }
  }
}

/**
 * Ids de los pagos reales en ventana, SIN orden garantizado. El toast de
 * "Deshacer" lo captura al mostrarse: son los pagos que ya existían antes
 * del pago que el toast anuncia, y por lo tanto NO candidatos a revertir.
 * Identidad en vez de relojes: el catch-up de dos cuotas del mismo ciclo
 * cae con segundos de diferencia y cualquier corte por timestamp queda a
 * merced del skew cliente↔server.
 */
export function collectRevertablePaymentIds(
  params: RevertablePaymentScanParams,
): string[] {
  const ids = new Set<string>()
  for (const p of iterateRevertablePayments(params)) ids.add(p.id)
  return [...ids]
}

/**
 * Candidato a revertir para el "Deshacer" del toast de pago: el payment
 * REAL más reciente del fijo cuyo `paidAt` cae en la ventana del ciclo
 * vigente. El caller escanea los caches de RQ, que con gcTime 24h
 * conservan ventanas de ciclos anteriores: sin el filtro de ventana, un
 * pago viejo real podía ganar mientras el recién registrado seguía
 * optimista, y el Deshacer revertía el pago del ciclo ANTERIOR.
 *
 * `excludeIds` (los reales que ya existían al mostrarse el toast, vía
 * `collectRevertablePaymentIds`) cierra el caso restante DENTRO de la
 * ventana: en un catch-up de dos cuotas, el toast del segundo pago no
 * puede elegir el real de la primera. Sin candidato devuelve null y el
 * caller avisa "todavía sincronizando" en vez de adivinar.
 */
export function pickLatestRevertablePaymentId(
  params: RevertablePaymentScanParams & {
    excludeIds?: ReadonlyArray<string>
  },
): string | null {
  const excluded = new Set(params.excludeIds ?? [])
  let latest: { id: string; paidAtMs: number } | null = null
  for (const p of iterateRevertablePayments(params)) {
    if (excluded.has(p.id)) continue
    if (!latest || p.paidAtMs > latest.paidAtMs) {
      latest = p
    }
  }
  return latest?.id ?? null
}

export function mapFixedExpensePaymentRow(row: FixedExpensePaymentRow): FixedExpensePayment {
  return {
    id: row.id,
    fixedExpenseId: row.fixed_expense_id,
    periodMonth: row.period_month,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    createdAt: row.created_at,
    expenseId: typeof row.expense_id === 'string' ? row.expense_id : null,
  }
}
