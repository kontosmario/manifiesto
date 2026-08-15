import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { computeCycleSurplusSigned } from '@/features/month-close/sobrante'
import i18n from '@/lib/i18n'

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

  // ── Rediseño "La Edición" — passthroughs opcionales ────────────────
  /** Ordinal de la edición (fetch-wrapped-shelf). */
  editionNumber?: CycleWrappedPayload['editionNumber']
  /** Saldo firmado del ciclo anterior (sub del veredicto). */
  previousCycle?: CycleWrappedPayload['previousCycle']
  /** Reserva disponible (plan de recuperación en EXCEDIDO). */
  reserveAvailable?: CycleWrappedPayload['reserveAvailable']
  /** Estantería de la contratapa (fetch-wrapped-shelf). */
  shelf?: CycleWrappedPayload['shelf']
  /** Gate de rol para confirmar la decisión (RPC owner-only). */
  canDecide?: CycleWrappedPayload['canDecide']
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
  editionNumber,
  previousCycle,
  reserveAvailable,
  shelf,
  canDecide,
}: BuildArgs): CycleWrappedPayload {
  // Rango display: si el ciclo es calendario (1→1 del mes siguiente)
  // no mostramos rango porque el periodLabel ya alcanza.
  const periodRange = buildPeriodRange(summary.period_start, summary.period_end)
  // Período CORTO (< 21 días) = ciclo semanal/quincenal — tanto del
  // modo dinámico como de sueldos rolling PREEXISTENTES (intencional:
  // para ellos "Julio 2026" también se repetía 2-4 veces por mes; el
  // rango es el título honesto en ambos casos).
  const periodDays =
    (Date.parse(summary.period_end) - Date.parse(summary.period_start)) / 86_400_000
  const isShortPeriod = Number.isFinite(periodDays) && periodDays > 0 && periodDays < 21

  // Top categorías: el rollup puede traer category_breakdown como array
  // o como record. Normalizamos a array, ordenamos desc y tomamos hasta
  // 3 (pantalla 03 del rediseño). `topCategory` (legacy) = la primera.
  const topCategories = pickTopCategories({
    breakdown: summary.category_breakdown,
    totalSpent: summary.total_spent,
    categoryNameById,
    limit: 3,
  })
  const topCategory = topCategories[0] ?? null

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
    // Ciclos CORTOS (semana/quincena del modo dinámico): el
    // period_label del server es un nombre de mes ("Julio 2026") que se
    // repetiría 2-4 veces por mes — el rango real ("7 jul – 13 jul") es
    // el título honesto, y se anula el subtítulo para no duplicarlo.
    // Los ciclos ~mensuales (sueldo día 15, calendario) NO cambian:
    // conservan nombre de mes como título + rango como subtítulo.
    periodLabel: isShortPeriod && periodRange ? periodRange : summary.period_label,
    periodRange: isShortPeriod ? null : periodRange,
    // Rediseño: el sello de la portada muestra el rango SIEMPRE, también
    // en ciclos calendario (donde `periodRange` es null a propósito).
    // La flecha "→" es la del handoff (HTML:56); el legacy usa "–".
    periodRangeDisplay:
      buildPeriodRangeAlways(summary.period_start, summary.period_end) ??
      summary.period_label,
    selloRango:
      buildSelloRango(summary.period_start, summary.period_end) ??
      summary.period_label.toUpperCase(),
    cycleDays:
      Number.isFinite(periodDays) && periodDays > 0 ? Math.round(periodDays) : 30,
    totalSpent: Number(summary.total_spent ?? 0),
    // "Tienes $X para administrar" (closing) = TODO lo que entró al
    // ciclo: sueldo base + income_events. Con solo monthly_income, un
    // hogar de INGRESO DINÁMICO (sueldo 0 por diseño) veía "$0 para
    // administrar" — y en fixed los extras también son plata que entró.
    // Mismo criterio que el veredicto (computeCycleSurplusSigned).
    monthlyIncome:
      Number(summary.monthly_income ?? 0) + Number(summary.extra_income ?? 0),
    // El "veredicto" (2da escena) muestra el saldo del ciclo. Usamos el
    // sobrante REAL con signo = (sueldo + income extra del ciclo) − gasto −
    // ahorro comprometido, NO el `savings_delta` del server (= max(0, sueldo −
    // gasto), clampeado e ignorando el income extra → daba "empatado" cuando
    // el mes cerró con +130k gracias al arrastre). Caso Mayo: +139k.
    savingsDelta: computeCycleSurplusSigned(summary),
    expensesCount: Number(summary.expenses_count ?? 0),
    deltaVsPreviousPercent:
      summary.delta_vs_previous_percent == null
        ? null
        : Number(summary.delta_vs_previous_percent),
    topCategory,
    topCategories,
    // Fijos del ciclo (strip de la 03). Los selects que no traen las
    // columnas dejan undefined → null explícito y el strip se oculta.
    fixedPaidCount:
      summary.fixed_paid_count == null ? null : Number(summary.fixed_paid_count),
    totalFixedSpent:
      summary.total_fixed_spent == null ? null : Number(summary.total_fixed_spent),
    topExpense,
    achievementsEarnedInCycle,
    mood: summary.mood ?? null,
    editionNumber,
    previousCycle,
    reserveAvailable,
    shelf,
    canDecide,
    pendingLeftoverDecision,
    pastLeftoverDecision,
    activeGoal,
    nextCycleAnchor,
    onApplyLeftoverDecision,
  }
}

/** Rango display SIN el early-return de calendario — para el chip de la
 *  portada del rediseño, que muestra el rango siempre (flecha del
 *  handoff, HTML:56). */
function buildPeriodRangeAlways(
  periodStart: string,
  periodEnd: string,
): string | null {
  const start = parseISODate(periodStart)
  const end = parseISODate(periodEnd)
  if (!start || !end) return null
  const lastDay = new Date(end.year, end.month - 1, end.day)
  lastDay.setDate(lastDay.getDate() - 1)
  return `${start.day} ${monthAbbr(start.month - 1)} → ${lastDay.getDate()} ${monthAbbr(lastDay.getMonth())}`
}

/** Línea del sello: meses en PALABRA ("JUNIO → JULIO 2026"; un solo mes
 *  → "JUNIO 2026"). HTML:52. */
function buildSelloRango(
  periodStart: string,
  periodEnd: string,
): string | null {
  const start = parseISODate(periodStart)
  const end = parseISODate(periodEnd)
  if (!start || !end) return null
  const lastDay = new Date(end.year, end.month - 1, end.day)
  lastDay.setDate(lastDay.getDate() - 1)
  const startName = i18n.t(`control:months.long.${start.month - 1}`)
  const endName = i18n.t(`control:months.long.${lastDay.getMonth()}`)
  const year = lastDay.getFullYear()
  if (startName === endName) return `${startName} ${year}`.toUpperCase()
  return `${startName} → ${endName} ${year}`.toUpperCase()
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
  return `${start.day} ${monthAbbr(start.month - 1)} – ${lastDay.getDate()} ${monthAbbr(lastDay.getMonth())}`
}

/** Abreviatura del mes (0-indexed) localizada. */
function monthAbbr(monthIdx: number): string {
  return i18n.t(`control:months.short.${monthIdx}`)
}

interface PickTopCategoriesArgs {
  breakdown: MonthlySummaryHistory['category_breakdown']
  totalSpent: number
  categoryNameById: ReadonlyMap<string, string>
  /** Cuántas devolver (el ranking de la 03 usa 3). */
  limit: number
}

/** Top N categorías orden desc por monto. `share` recalculado contra
 *  `total_spent` en cliente — el `pct` del server usa la base variable
 *  (`total_variable_spent`) y lo consume Control: no se toca. */
function pickTopCategories({
  breakdown,
  totalSpent,
  categoryNameById,
  limit,
}: PickTopCategoriesArgs): Array<{ name: string; amount: number; share: number }> {
  if (!breakdown) return []

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

  const uncategorized = i18n.t('control:wrapped.topCategory.uncategorized')
  return entries
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((e) => ({
      // El name crudo viene del breakdown (ES, server-side). Resolvemos el
      // display localizado por `categoryId` PRIMERO; sólo caemos al crudo
      // si la categoría ya no existe en el mapa o no hay id.
      name:
        (e.categoryId ? categoryNameById.get(e.categoryId) : undefined) ??
        e.name ??
        uncategorized,
      amount: e.amount,
      share:
        totalSpent > 0 ? Math.max(0, Math.min(1, e.amount / totalSpent)) : 0,
    }))
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
