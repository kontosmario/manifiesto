import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'

/**
 * Convierte un row de `monthly_summaries` (ya parseado al shape de
 * `MonthlySummaryHistory`) al payload que consume el `CycleWrappedModal`.
 *
 * Aplica formato + lookups locales (category name, achievements en el
 * rango del ciclo) sin tocar la red — todas las dependencias son in-memory.
 */

interface BuildArgs {
  summary: MonthlySummaryHistory
  categoryNameById: ReadonlyMap<string, string>
  /** earnedAt ISO timestamps de logros del usuario. Se cuenta cuántos
   *  caen dentro del rango [period_start, period_end). */
  achievementsEarnedAt: readonly string[]
  /** Spec B — decisión pendiente sobre el saldo a favor (opcional). */
  pendingLeftoverDecision?: CycleWrappedPayload['pendingLeftoverDecision']
  /** Decisión ya tomada para este cycle (replay read-only). Mutuamente
   *  exclusivo con `pendingLeftoverDecision` — si llegan los dos, el
   *  modal prevalece `pastLeftoverDecision`. */
  pastLeftoverDecision?: CycleWrappedPayload['pastLeftoverDecision']
  /** Meta activa para la opción "A tu meta" (opcional). */
  activeGoal?: CycleWrappedPayload['activeGoal']
  /** YYYY-MM-DD del inicio del nuevo ciclo (opcional). */
  nextCycleAnchor?: CycleWrappedPayload['nextCycleAnchor']
  /** Callback async para aplicar la decisión vía RPC (opcional). */
  onApplyLeftoverDecision?: CycleWrappedPayload['onApplyLeftoverDecision']
}

export function buildWrappedPayloadFromSummary({
  summary,
  categoryNameById,
  achievementsEarnedAt,
  pendingLeftoverDecision,
  pastLeftoverDecision,
  activeGoal,
  nextCycleAnchor,
  onApplyLeftoverDecision,
}: BuildArgs): CycleWrappedPayload {
  // Rango display: si el ciclo es calendario (1→1 del mes siguiente)
  // no mostramos rango porque el periodLabel ya alcanza.
  const periodRange = buildPeriodRange(summary.period_start, summary.period_end)

  // Top categoría: el rollup puede traer category_breakdown como array
  // o como record. Normalizamos a array y picamos la primera.
  const topCategory = pickTopCategory({
    breakdown: summary.category_breakdown,
    totalSpent: summary.total_spent,
    categoryNameById,
  })

  // Top expense: viene como `{ id, description, price, ... }` o null
  // si el ciclo no tuvo gastos.
  const top = summary.top_expense
  const topExpense = top
    ? {
        description: top.description ?? '',
        price: Number(top.price ?? 0),
        occurredAt: String(top.created_at ?? summary.period_start),
      }
    : null

  // Achievements en rango: filtramos por earnedAt entre period_start
  // (inclusive) y period_end (exclusive — mismo invariante que usa el
  // rollup SQL).
  const startMs = isoToMs(summary.period_start)
  const endMs = isoToMs(summary.period_end)
  const achievementsEarnedInCycle = achievementsEarnedAt.reduce((acc, ts) => {
    const ms = Date.parse(ts)
    if (Number.isNaN(ms)) return acc
    if (ms >= startMs && ms < endMs) return acc + 1
    return acc
  }, 0)

  return {
    periodLabel: summary.period_label,
    periodRange,
    totalSpent: Number(summary.total_spent ?? 0),
    monthlyIncome: Number(summary.monthly_income ?? 0),
    savingsDelta: Number(summary.savings_delta ?? 0),
    expensesCount: Number(summary.expenses_count ?? 0),
    deltaVsPreviousPercent:
      summary.delta_vs_previous_percent == null
        ? null
        : Number(summary.delta_vs_previous_percent),
    topCategory,
    topExpense,
    achievementsEarnedInCycle,
    mood: summary.mood ?? null,
    pendingLeftoverDecision,
    pastLeftoverDecision,
    activeGoal,
    nextCycleAnchor,
    onApplyLeftoverDecision,
  }
}

/** ¿El ciclo es calendario (1→1)? Si sí no mostramos rango. */
function buildPeriodRange(
  periodStart: string,
  periodEnd: string,
): string | null {
  const start = parseISODate(periodStart)
  const end = parseISODate(periodEnd)
  if (!start || !end) return null
  if (start.day === 1 && end.day === 1) return null
  // periodEnd es exclusivo. Para display restamos un día.
  const lastDay = new Date(end.year, end.month - 1, end.day)
  lastDay.setDate(lastDay.getDate() - 1)
  return `${start.day} ${MES_ABBR[start.month - 1]} – ${lastDay.getDate()} ${MES_ABBR[lastDay.getMonth()]}`
}

interface PickTopCategoryArgs {
  breakdown: MonthlySummaryHistory['category_breakdown']
  totalSpent: number
  categoryNameById: ReadonlyMap<string, string>
}

function pickTopCategory({
  breakdown,
  totalSpent,
  categoryNameById,
}: PickTopCategoryArgs): CycleWrappedPayload['topCategory'] {
  if (!breakdown) return null

  // Normalizamos las dos formas posibles (array como `close_monthly_cycle`
  // lo escribe hoy, o el legacy record) a `{ categoryId, name, amount }`.
  let entries: Array<{ categoryId: string | null; name: string | null; amount: number }>
  if (Array.isArray(breakdown)) {
    entries = breakdown.map((row) => ({
      categoryId: row.category_id ?? null,
      name: row.name ?? null,
      amount: Number(row.total ?? 0),
    }))
  } else {
    entries = Object.entries(breakdown).map(([id, value]) => ({
      categoryId: id === '__uncat__' ? null : id,
      name: null,
      amount: Number(value.amount ?? 0),
    }))
  }

  if (entries.length === 0) return null

  let top = entries[0]
  if (!top) return null
  for (const e of entries) {
    if (e.amount > top.amount) top = e
  }
  if (top.amount <= 0) return null

  const name =
    top.name ??
    (top.categoryId
      ? categoryNameById.get(top.categoryId) ?? 'Sin categoría'
      : 'Sin categoría')
  const share = totalSpent > 0 ? top.amount / totalSpent : 0
  return {
    name,
    amount: top.amount,
    share: Math.max(0, Math.min(1, share)),
  }
}

interface ParsedISODate {
  year: number
  month: number
  day: number
}

function parseISODate(iso: string | null | undefined): ParsedISODate | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function isoToMs(iso: string): number {
  const parsed = parseISODate(iso)
  if (!parsed) return 0
  return new Date(parsed.year, parsed.month - 1, parsed.day).getTime()
}

const MES_ABBR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const
