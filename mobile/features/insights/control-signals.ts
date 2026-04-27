// Control signals engine — heuristic rules that turn raw data into
// ranked actionable advice. Powers the "ASISTENTE FINANCIERO" card:
// no LLM, no remote call, fully deterministic math on data we already
// have in the app.
//
// Each rule:
//  - reads a tight slice of the domain (expenses, fixed_expenses,
//    notifications, summaries, velocity, limits, savings goal,
//    day-of-week pattern, family members)
//  - emits zero or one `ControlAdvisorTask` (multi-emit rules
//    return arrays explicitly)
//  - declares its own `confidence` (0..1) so the builder can rank
//    by `urgency × impactRaw × confidence` and drop low-confidence
//    surface candidates (< 0.4)
//
// Rules of the road:
//  - data-grounded — every claim is a specific peso amount from
//    THIS user, never generic "ahorrá más"
//  - rioplatense direct copy ("vos", "tenés", "mirá")
//  - cap output at 5 — Asesor card is designed for 3-5 items
//
// Data tiers (for confidence scoring):
//   T0 real-time: confidence 1.0 — no historical baseline needed
//   T1 1 cycle:   confidence ramps closedDays/14
//   T2 3 cycles:  confidence × min(1, summaries/3)
//   T3 60-day:    confidence ramps closedDays/21

import type { Expense } from '@/features/expenses/expense-repository'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { Category } from '@/features/categories/use-categories'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import type {
  ControlAdvisorTask,
  ControlView,
  DayDetail,
  DowBucket,
} from '@/features/insights/control-v2-mock'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import type { ControlAction } from '@/features/insights/control-action'
import type { UserBaselines } from '@/features/insights/user-baselines'

export interface CategoryLimit {
  id: string
  category_id: string
  monthly_cap: number
  warning_threshold_pct: number
}

export interface VelocitySnapshot {
  snapshot_date: string
  avg_daily_last_7: number
  avg_daily_last_30: number
  momentum: number
  forecast_close_amount: number
  stress_level: 'calm' | 'watch' | 'warn' | 'critical'
}

/** Notification row shape as delivered by the realtime stream. */
export interface NotificationLite {
  id: string
  kind: string
  severity: 'info' | 'success' | 'warning' | 'alert'
  created_at: string
  metadata: Record<string, unknown>
}

interface BuildSignalsArgs {
  view: ControlView
  expenses: Expense[]
  fixedExpenses: FixedExpense[]
  categoriesExpense: Category[]
  summaries: MonthlySummaryHistory[]
  limits: CategoryLimit[]
  velocity: VelocitySnapshot | null
  notifications: NotificationLite[]
  savingsGoal: SavingsGoal | null
  cupoDiario: number
  gastoHoy: number
  diasRestantes: number
  ingresoMes: number
  fijosMes: number
  /** Persisted per-device dismiss map keyed by fixed_expense_id →
   *  price-at-dismissal. */
  dismissedHikes?: Record<string, number>
  /** Per-user calibration baselines. When ≥3 cycles closed, this
   *  replaces hardcoded thresholds (e.g. cat-dominance 40%) with
   *  the user's own P75 — what's "normal" for them. */
  baselines?: UserBaselines
  now?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const DOW_NAMES_FULL = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
] as const

/** Minimum confidence under which a task is dropped entirely. */
const MIN_CONFIDENCE = 0.4

// ─── confidence helpers ─────────────────────────────────────────────

/** Tier-1 ramp: 1 closed cycle ≡ ~14 closed days for high confidence. */
function rampOneCycle(closedDays: number): number {
  return clamp01(closedDays / 14)
}

/** Tier-3 ramp: pattern detection needs ~21 closed days. */
function rampThreeWeeks(closedDays: number): number {
  return clamp01(closedDays / 21)
}

/** Tier-2 multiplier: solid baseline at 3 prior closed cycles. */
function rampSummaries(summariesCount: number): number {
  return clamp01(summariesCount / 3)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

/** 1-based current day of the cycle derived from closed-day count. */
function currentCycleDay(view: ControlView): number {
  return view.detalleDias.length + 1
}

// ─── builder ────────────────────────────────────────────────────────

export function buildControlSignals(
  args: BuildSignalsArgs,
): ControlAdvisorTask[] {
  const now = args.now ?? new Date()
  const signals: ControlAdvisorTask[] = []

  // Group 1 — Cycle mechanics
  pushIfDefined(signals, buildStressWeek(args, now))
  pushIfDefined(signals, buildPaydayProximity(args))
  pushIfDefined(signals, buildStartOfCycleSplurge(args))
  pushIfDefined(signals, buildEndOfCycleAcceleration(args))
  pushIfDefined(signals, buildRecoveryPath(args))
  pushIfDefined(signals, buildVelocityWarning(args))
  pushIfDefined(signals, buildPositiveForecast(args))

  // Group 2 — Category signals
  pushIfDefined(signals, buildCategoryAcceleration(args))
  signals.push(...buildCategoryCapBreaches(args))
  pushIfDefined(signals, buildCategoryDominance(args))
  pushIfDefined(signals, buildCategoryReductionWin(args))

  // Group 3 — Expense hygiene
  pushIfDefined(signals, buildSmallLeaksInsight(args))
  pushIfDefined(signals, buildNightImpulse(args))
  pushIfDefined(signals, buildUndetectedSubscription(args))

  // Group 4 — Pattern insights (dow + weekend merged into weekly-pattern)
  pushIfDefined(signals, buildWeeklyPattern(args))

  // Group 5 — Commitments & income health
  pushIfDefined(signals, buildFijosRatioHealth(args))
  pushIfDefined(signals, buildIncomeVolatility(args))
  signals.push(...buildFromZombieNotifications(args, now))
  signals.push(...buildFromPriceHikeNotifications(args, now))

  // Group 6 — Savings & goals
  pushIfDefined(signals, buildSavingsFeasibility(args))
  pushIfDefined(signals, buildSavingsOverachievement(args))

  // Group 7 — Family dynamics
  pushIfDefined(signals, buildMemberContributionImbalance(args))

  // Group 8 — Positive reinforcement
  pushIfDefined(signals, buildStreakEncouragement(args))

  // Drop low-confidence, fuse related signals into richer single
  // cards, then rerank by urgency × impact × confidence.
  const filtered = signals.filter((s) => s.confidence >= MIN_CONFIDENCE)
  const fused = fuseSignals(filtered)
  return fused
    .sort((a, b) => {
      const sa =
        urgencyWeight(a.urgency) *
        Math.max(1, a.impactRaw) *
        a.confidence
      const sb =
        urgencyWeight(b.urgency) *
        Math.max(1, b.impactRaw) *
        b.confidence
      if (sb !== sa) return sb - sa
      return b.impactRaw - a.impactRaw
    })
    .slice(0, 5)
}

// ─── F8 — signal fusion ─────────────────────────────────────────────
//
// When two related signals fire about the same domain we keep only
// the higher-priority one and enrich its body with the other's
// finding. Stacking duplicates wastes attention; one richer card
// reads as "this is the real pattern" instead of two disjoint warnings.
//
// Patterns we fuse today:
//  · start-splurge + velocity (any tier) → keep velocity, prepend
//    "arrancaste fuerte" context to its body.
//  · cat-accel + cat-dominance on same category → keep accel,
//    prepend "ya pesa N% del mes" context.
//  · recovery-hard + velocity → drop velocity (recovery-hard is
//    already telling the user to readjust).
function fuseSignals(
  tasks: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // start-splurge ⊕ velocity
  const startSplurge = byId.get('start-splurge')
  const velocity = byId.get('velocity')
  if (startSplurge && velocity) {
    const merged: ControlAdvisorTask = {
      ...velocity,
      body: `Arrancaste fuerte (${startSplurge.title.split(': ')[1] ?? 'porcentaje alto en los primeros días'}). ${velocity.body}`,
      confidence: Math.max(velocity.confidence, startSplurge.confidence),
    }
    byId.set('velocity', merged)
    byId.delete('start-splurge')
  }

  // cat-accel ⊕ cat-dominance (same category)
  const catAccel = byId.get('cat-accel')
  if (catAccel) {
    const dominanceKey = Array.from(byId.keys()).find(
      (k) => k.startsWith('cat-dominance-') && byId.get(k)?.cat === catAccel.cat,
    )
    if (dominanceKey) {
      const dominance = byId.get(dominanceKey)!
      const merged: ControlAdvisorTask = {
        ...catAccel,
        body: `${catAccel.body} Además, ya pesa el ${dominance.title.match(/\d+%/)?.[0] ?? '40%'} del mes — palanca grande.`,
        urgency: 'media',
        impactRaw: catAccel.impactRaw + Math.round(dominance.impactRaw * 0.5),
        confidence: Math.max(catAccel.confidence, dominance.confidence),
      }
      byId.set('cat-accel', merged)
      byId.delete(dominanceKey)
    }
  }

  // recovery-hard ⊕ velocity → drop velocity (redundant)
  if (byId.has('recovery-hard') && byId.has('velocity')) {
    byId.delete('velocity')
  }

  return Array.from(byId.values())
}

// ─── Group 1 — Cycle mechanics ──────────────────────────────────────

/** 3+ fijos due in next 7 days → heads-up about the coming squeeze. */
function buildStressWeek(
  args: BuildSignalsArgs,
  now: Date,
): ControlAdvisorTask | null {
  const cutoff = new Date(now.getTime() + 7 * DAY_MS)
  const due = args.fixedExpenses.filter((f) => {
    if (f.status === 'completed' || !f.next_due_on) return false
    const dueDate = new Date(f.next_due_on)
    return dueDate >= now && dueDate <= cutoff
  })
  if (due.length < 3) return null
  const total = due.reduce((s, f) => s + Number(f.amount ?? 0), 0)
  const names = due.slice(0, 3).map((f) => f.name).filter(Boolean).join(', ')
  return {
    id: 'stress-week',
    emoji: '📅',
    cat: 'Fijos',
    title: `Semana cargada: ${due.length} fijos por vencer`,
    body: `Se vienen ${names}${due.length > 3 ? ` y ${due.length - 3} más` : ''} en 7 días. Sumado es ${fmt(total)}. Mirá de tener la reserva hecha.`,
    impact: `Reservar ${fmt(total)} antes del finde`,
    impactRaw: total,
    cta: 'Ver fijos',
    urgency: 'alta',
    confidence: 1.0, // T0 — derived from fixed_expenses.next_due_on, no history needed
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Un "fijo" es un pago que te llega todos los meses sí o sí (alquiler, luz, internet, suscripciones). Cuando varios caen en la misma semana, esa semana tenés menos plata libre. Te avisamos con tiempo para que no te agarre desprevenido.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' },
  }
}

/** Faltan X días y libre/día queda < 70% del cupo. */
function buildPaydayProximity(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.diasRestantes <= 1 || args.diasRestantes > 14) return null
  if (args.view.restanteMes <= 0) return null
  const remaining = args.view.restanteMes
  const sustainable = remaining / args.diasRestantes
  if (sustainable >= args.cupoDiario * 0.7) return null
  return {
    id: 'payday-proximity',
    emoji: '📆',
    cat: 'Ciclo',
    title: `Faltan ${args.diasRestantes} días y te queda ${fmt(remaining)}`,
    body: `Para llegar al próximo sueldo sin entrar en rojo, tu tope de los próximos días es ${fmt(sustainable)}/día (era ${fmt(args.cupoDiario)}). Tratá de no pasarte.`,
    impact: `Tope nuevo: ${fmt(sustainable)}/día`,
    impactRaw: Math.round((args.cupoDiario - sustainable) * args.diasRestantes),
    cta: 'Entendido',
    urgency: sustainable < args.cupoDiario * 0.5 ? 'alta' : 'media',
    confidence: 1.0, // T0 — based on remaining cycle math only
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Agarramos la plata que te queda para el mes y la dividimos por los días que faltan para cobrar. Ese número es lo máximo que podés gastar cada día para no llegar seco.',
    action: { kind: 'dismiss', dismissId: 'payday-proximity' },
  }
}

/** First 3 days of cycle consumed >15% of monthly libre. */
function buildStartOfCycleSplurge(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.view.detalleDias.length < 4) return null
  if (args.view.detalleDias.length + 1 > 10) return null // too late to act
  const first3 = args.view.detalleDias.slice(0, 3)
  const spent = first3.reduce((s, d) => s + d.gasto, 0)
  const libreMes = args.cupoDiario * (args.view.diasRestantes + args.view.detalleDias.length)
  if (libreMes <= 0) return null
  const pct = (spent / libreMes) * 100
  if (pct < 15) return null
  return {
    id: 'start-splurge',
    emoji: '🚀',
    cat: 'Arranque',
    title: `Arrancaste fuerte: ${Math.round(pct)}% del mes en 3 días`,
    body: `Los primeros 3 días gastaste ${fmt(spent)} — equivalente a más de ${Math.round(pct / 3.3)} días de cupo. No es grave, pero el ritmo no escala.`,
    impact: `Bajar al cupo = +${fmt(spent - args.cupoDiario * 3)}/mes`,
    impactRaw: Math.max(0, Math.round(spent - args.cupoDiario * 3)),
    cta: 'Voy a cuidarme',
    urgency: 'media',
    confidence: 0.9, // T1 — needs 3+ closed days; high since data is fresh
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Apenas cobrás, gastar más tranquilo es común — hay plata nueva en la cuenta. El problema es cuando los primeros 3 días ya te comiste una porción grande: el resto del mes queda ajustado.',
    action: { kind: 'dismiss', dismissId: 'start-splurge' },
  }
}

/** Last 3 closed days averaged >130% of cycle's own average. */
function buildEndOfCycleAcceleration(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.view.detalleDias.length < 6) return null
  if (args.diasRestantes > 5) return null
  const last3 = args.view.detalleDias.slice(-3)
  const last3Avg = last3.reduce((s, d) => s + d.gasto, 0) / 3
  const cycleAvg = args.view.promedioDiario
  if (cycleAvg === 0) return null
  const ratio = last3Avg / cycleAvg
  if (ratio < 1.3) return null
  const extra = (last3Avg - cycleAvg) * 3
  return {
    id: 'end-acceleration',
    emoji: '⚠️',
    cat: 'Cierre',
    title: `Últimos 3 días ${Math.round((ratio - 1) * 100)}% arriba`,
    body: `Los últimos 3 días promediaste ${fmt(last3Avg)} vs ${fmt(cycleAvg)} del mes. Faltan ${args.diasRestantes} días — si sostenés este ritmo, te pasás.`,
    impact: `Volver al promedio = ${fmtDelta(-extra)}`,
    impactRaw: Math.round(extra),
    cta: 'Voy a frenar',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Hacia el final del mes muchos aflojan el control pensando "ya está, cierro mañana". Justo ahí es cuando más rápido se va la plata. Comparamos los últimos 3 días con tu promedio del mes para avisarte si la velocidad cambió.',
    action: { kind: 'dismiss', dismissId: 'end-acceleration' },
  }
}

/** If overspending today, compute a recovery-friendly new daily cap. */
function buildRecoveryPath(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.view.delta >= 0) return null
  if (args.diasRestantes <= 1) return null
  const overspend = Math.abs(args.view.delta)
  const newCupo = args.cupoDiario - overspend / args.diasRestantes
  if (newCupo < args.cupoDiario * 0.4) {
    return {
      id: 'recovery-hard',
      emoji: '🧭',
      cat: 'Recuperación',
      title: 'Te pasaste bastante hoy',
      body: `Para cerrar como querías, tendrías que gastar menos de ${fmt(newCupo)}/día los próximos ${args.diasRestantes} días. Es durísimo — considerá reajustar la meta o mover algún fijo.`,
      impact: `Recuperar ${fmt(overspend)}`,
      impactRaw: Math.round(overspend),
      cta: 'Ajustar',
      urgency: 'alta',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Te pasaste tanto del presupuesto de hoy que recuperarte apretando los próximos días no es realista. Mejor ajustar la meta o ver si hay algún fijo que puedas mover.',
      action: { kind: 'navigate', route: '/(app)/settings' },
    }
  }
  return {
    id: 'recovery-soft',
    emoji: '🧭',
    cat: 'Recuperación',
    title: 'Ajustá el cupo y cerrás bien',
    body: `Hoy te pasaste por ${fmt(overspend)}. Si de acá hasta fin de mes gastás ${fmt(newCupo)}/día, llegás sin quedarte corto.`,
    impact: `Nuevo cupo sugerido: ${fmt(newCupo)}/día`,
    impactRaw: Math.round(overspend),
    cta: 'Entendido',
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Te pasaste del tope de hoy. Repartimos el sobrante entre los días que quedan y te sale un cupo nuevo un poco más bajo. Si seguís ese número el resto del mes, cerrás sin quedarte corto.',
    action: { kind: 'dismiss', dismissId: 'recovery-soft' },
  }
}

/** Velocity-based warning when forecast > libreMes by more than 15%. */
function buildVelocityWarning(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const v = args.velocity
  if (!v) return null
  if (v.stress_level === 'calm') return null
  const over = v.forecast_close_amount - args.view.gastoProyectadoMes
  const urgency: ControlAdvisorTask['urgency'] =
    v.stress_level === 'critical'
      ? 'alta'
      : v.stress_level === 'warn'
        ? 'media'
        : 'baja'
  return {
    id: 'velocity',
    emoji: '⏱️',
    cat: 'Ritmo',
    title: stressTitle(v.stress_level),
    body: `Tu ritmo de los últimos 7 días proyecta cerrar en ${fmt(v.forecast_close_amount)}. ${
      v.momentum > 1
        ? `Vas ${((v.momentum - 1) * 100).toFixed(0)}% más rápido que el promedio del mes.`
        : 'El ritmo bajó un poco — seguí así.'
    }`,
    impact: over > 0 ? `Freno = ${fmtDelta(-over)}` : 'Mantener ritmo',
    impactRaw: Math.max(0, Math.round(over)),
    cta: 'Entendido',
    urgency,
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Medimos a qué velocidad venís gastando últimamente comparado con lo que venías haciendo antes. Si aceleraste mucho, te estimamos a qué número vas a cerrar el mes.',
    action: { kind: 'dismiss', dismissId: 'velocity' },
  }
}

/** Positive forecast — when things are going well, SAY IT.
 *  Inline CTA: if there's an active savings goal, propose moving a
 *  conservative slice (50% of the projected leftover) directly to the
 *  alcancía via the `add_savings_contribution` RPC — 1 tap, no
 *  navigation. Without an active goal, degrade to "open savings". */
function buildPositiveForecast(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (!args.view.alcanzaElMes) return null
  if (args.view.sobrantePresupuestadoMes < args.cupoDiario * 2) return null
  const sobra = args.view.sobrantePresupuestadoMes
  const hasActiveGoal = !!(args.savingsGoal && args.savingsGoal.isActive)
  // Round the contribution down to the nearest 1k for nicer copy.
  const proposed = Math.max(0, Math.floor((sobra * 0.5) / 1000) * 1000)
  return {
    id: 'positive-forecast',
    emoji: '🌱',
    cat: 'Proyección',
    title: `Vas a cerrar con ${fmt(sobra)} de sobra`,
    body: hasActiveGoal && proposed > 0
      ? `Si sostenés este ritmo los ${args.diasRestantes} días que quedan, cerrás en verde. Te propongo mover ${fmt(proposed)} a "${args.savingsGoal!.title}" ya — el resto te queda de colchón.`
      : `Si sostenés este ritmo los ${args.diasRestantes} días que quedan, cerrás en verde. Ese excedente puede ir a tu meta o a la alcancía.`,
    impact: hasActiveGoal && proposed > 0
      ? `+${fmt(proposed)} a la alcancía`
      : `+${fmt(sobra)} al cierre`,
    impactRaw: Math.round(proposed > 0 ? proposed : sobra),
    cta: hasActiveGoal && proposed > 0 ? `Mover ${fmt(proposed)}` : 'A la meta',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Mirando cómo venís gastando y los días que faltan, te proyectamos con cuánto terminás el mes si no cambia nada. Cuando es positivo, es plata que te sobró — podés mandarla a tu meta o dejarla de colchón.',
    action:
      hasActiveGoal && proposed > 0
        ? {
            kind: 'quick-savings-contribution',
            amount: proposed,
            dismissId: 'positive-forecast',
          }
        : { kind: 'open-savings-goal' },
  }
}

// ─── Group 2 — Category signals ─────────────────────────────────────

/** Top-category spending accelerating vs its 4-week average. */
function buildCategoryAcceleration(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.summaries.length === 0) return null
  const byCategory = groupExpensesByCategory(args.expenses, args.categoriesExpense)
  if (byCategory.length === 0) return null
  const topNow = byCategory.sort((a, b) => b.amount - a.amount)[0]!
  const historicalAvg = avgCategoryFromSummaries(args.summaries, topNow.name)
  if (historicalAvg === 0) return null
  const ratio = topNow.amount / historicalAvg
  // Per-user calibrated threshold (P75 of historical accel peaks);
  // falls back to 1.4× when fewer than 3 cycles available.
  const accelThreshold = args.baselines?.catAccelP75 ?? 1.4
  if (ratio < accelThreshold) return null
  const delta = topNow.amount - historicalAvg
  // Spike vs trend: compare the last 7 days for this category against
  // the cycle's older period. A heavy spike with a calm prior is most
  // likely a one-off (cumple, viaje, electrodoméstico) — say so. A
  // gradual rise suggests a habit shift.
  const spike = isCategorySpike(args.expenses, topNow.id, args.now ?? new Date())
  const titleSuffix = spike ? ' (puede ser un gasto puntual)' : ''
  const body = spike
    ? `Llevás ${fmt(topNow.amount)} este mes vs ${fmt(historicalAvg)} habitual. Casi todo es de los últimos 7 días — si fue algo único (cumple, viaje, electrodoméstico), tranqui. Si se repite, el mes próximo va a doler.`
    : `Llevás ${fmt(topNow.amount)} este mes vs ${fmt(historicalAvg)} habitual. La suba viene gradual, no de un solo día — parece un cambio de hábito.`
  return {
    id: 'cat-accel',
    emoji: spike ? '🎯' : '📈',
    cat: topNow.name,
    title: `${topNow.name} +${Math.round((ratio - 1) * 100)}% vs tu promedio${titleSuffix}`,
    body,
    impact: `Volver al promedio = ${fmtDelta(-delta)}/mes`,
    impactRaw: Math.round(delta),
    cta: 'Ver gastos',
    urgency: 'media',
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Si veniste gastando $100 en una cosa y este mes vas por $140, algo cambió. Puede ser puntual o un hábito nuevo — vale la pena mirar antes de que se haga costumbre.',
    action: {
      kind: 'open-expenses-filtered',
      filter: { categoryId: topNow.id },
    },
  }
}

/** Any category with spend > cap × warning_threshold — user-set caps. */
function buildCategoryCapBreaches(
  args: BuildSignalsArgs,
): ControlAdvisorTask[] {
  if (args.limits.length === 0) return []
  const byCategoryId = groupExpensesByCategoryId(args.expenses)
  const categoryName = (id: string) =>
    args.categoriesExpense.find((c) => c.id === id)?.name ?? 'Categoría'

  const out: ControlAdvisorTask[] = []
  for (const limit of args.limits) {
    const spent = byCategoryId.get(limit.category_id) ?? 0
    const threshold = limit.monthly_cap * (limit.warning_threshold_pct / 100)
    if (spent < threshold) continue
    const name = categoryName(limit.category_id)
    const pct = Math.round((spent / limit.monthly_cap) * 100)
    const breach = spent > limit.monthly_cap
    out.push({
      id: `cap-${limit.id}`,
      emoji: breach ? '🚫' : '⚠️',
      cat: name,
      title: breach
        ? `Te pasaste del tope en ${name}`
        : `${name} va al ${pct}% de tu tope`,
      body: breach
        ? `Tu tope era ${fmt(limit.monthly_cap)} y ya gastaste ${fmt(spent)}. Te sobregiraste por ${fmt(spent - limit.monthly_cap)}.`
        : `Llevás ${fmt(spent)} de los ${fmt(limit.monthly_cap)} que te propusiste. Quedan ${fmt(limit.monthly_cap - spent)} para cerrar el mes.`,
      impact: breach
        ? `Frenar acá = ${fmtDelta(-(spent - limit.monthly_cap))}`
        : `Mantenerte ≤ ${fmt(limit.monthly_cap)} = meta ok`,
      impactRaw: breach ? Math.round(spent - limit.monthly_cap) : 0,
      cta: 'Ver detalle',
      urgency: breach ? 'alta' : 'media',
      confidence: 1.0, // T0 — explicit user-set cap, no inference
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Vos le pusiste un tope a esta categoría ("no quiero gastar más de $X"). Cuando te acercás o te pasás, te avisamos. Es como ponerte una meta personal — ayuda a frenar antes de que sea tarde.',
      action: {
        kind: 'open-expenses-filtered',
        filter: { categoryId: limit.category_id },
      },
    })
  }
  return out
}

/** Category dominance — one category took >40% of total discretionary. */
function buildCategoryDominance(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const byCategory = groupExpensesByCategory(args.expenses, args.categoriesExpense)
  if (byCategory.length < 2) return null
  const total = byCategory.reduce((s, c) => s + c.amount, 0)
  if (total === 0) return null
  const top = byCategory.sort((a, b) => b.amount - a.amount)[0]!
  const share = top.amount / total
  // Per-user calibrated threshold: a category needs to beat the
  // user's own P75 share, not a global 40%. For users with naturally
  // concentrated spend (a single category always at 50%) this means
  // we don't fire constantly; for diverse spenders we fire earlier.
  const dominanceFloor = args.baselines?.catDominanceP75 ?? 0.4
  if (share < dominanceFloor) return null
  const pct = share * 100
  const save10 = top.amount * 0.1
  return {
    id: `cat-dominance-${top.id}`,
    emoji: '🎯',
    cat: top.name,
    title: `${top.name} se llevó ${Math.round(pct)}% del mes`,
    body: `De los ${fmt(total)} que gastaste, ${fmt(top.amount)} fueron a ${top.name}. Un recorte del 10% ahí es más grande que ahorrar en 3 categorías chicas.`,
    impact: `10% menos = +${fmt(save10)}/mes`,
    impactRaw: Math.round(save10),
    cta: 'Entendido',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando una sola categoría se come 40%+ de tu gasto, ahí está tu palanca más grande para ahorrar. Recortar 10% en esa categoría rinde más que cuidar 5 categorías chicas.',
    action: { kind: 'dismiss', dismissId: `cat-dominance-${top.id}` },
  }
}

/** Category reduction win — positive reinforcement when habit improves. */
function buildCategoryReductionWin(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.summaries.length === 0) return null
  const byCategory = groupExpensesByCategory(args.expenses, args.categoriesExpense)
  if (byCategory.length === 0) return null
  let bestWin: { name: string; now: number; avg: number; delta: number } | null = null
  for (const c of byCategory) {
    const avg = avgCategoryFromSummaries(args.summaries, c.name)
    if (avg === 0) continue
    const ratio = c.amount / avg
    if (ratio > 0.7) continue
    const delta = avg - c.amount
    if (delta < 5000) continue
    if (!bestWin || delta > bestWin.delta) {
      bestWin = { name: c.name, now: c.amount, avg, delta }
    }
  }
  if (!bestWin) return null
  const pct = Math.round(((bestWin.avg - bestWin.now) / bestWin.avg) * 100)
  return {
    id: 'cat-win',
    emoji: '✅',
    cat: bestWin.name,
    title: `${bestWin.name} bajó ${pct}% vs tu promedio`,
    body: `Gastaste ${fmt(bestWin.now)} este mes cuando solías gastar ${fmt(bestWin.avg)}. Si lo sostenés, son ${fmt(bestWin.delta * 12)} al año.`,
    impact: `+${fmt(bestWin.delta)}/mes sostenido`,
    impactRaw: Math.round(bestWin.delta),
    cta: '¡Gracias!',
    urgency: 'baja',
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Una categoría donde venías gastando $X bajó claramente este mes. Te mostramos el ahorro anual que representa — motiva sostener el cambio.',
    action: { kind: 'dismiss', dismissId: 'cat-win' },
  }
}

// ─── Group 3 — Expense hygiene ──────────────────────────────────────

/** Small frequent leaks — many sub-$5k expenses that add up. */
function buildSmallLeaksInsight(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  const small = discretionary.filter((e) => Number(e.price ?? 0) < 5000)
  if (small.length < 10) return null
  const total = small.reduce((s, e) => s + Number(e.price ?? 0), 0)
  const pctOfCycle = total / Math.max(1, args.cupoDiario * args.view.detalleDias.length)
  if (pctOfCycle < 0.12) return null
  return {
    id: 'small-leaks',
    emoji: '💧',
    cat: 'Goteo',
    title: `${small.length} gastos chicos suman ${fmt(total)}`,
    body: `Son compras de menos de $5.000 que pasan desapercibidas (kiosko, delivery, café). Juntos son el ${Math.round(pctOfCycle * 100)}% de lo que llevás gastado este mes.`,
    impact: `Cortar 30% = ${fmt(total * 0.3)}/mes`,
    impactRaw: Math.round(total * 0.3),
    cta: 'Ver chicos',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los gastos de menos de $5.000 parecen insignificantes uno por uno, pero juntos son como una canilla que gotea. Es donde más plata escondida hay, porque nadie los registra mentalmente.',
    action: {
      kind: 'open-expenses-filtered',
      filter: { priceMax: 5000 },
    },
  }
}

/** Night impulse — >70% of discretionary spend after 22hs (raised threshold). */
function buildNightImpulse(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 10) return null
  let night = 0
  let nightAmount = 0
  let totalAmount = 0
  for (const e of discretionary) {
    const h = new Date(e.created_at).getHours()
    const amt = Number(e.price ?? 0)
    totalAmount += amt
    // 22hs → 02hs covers AR night-impulse window without false-firing
    // on AR's typical late dinners (20-21hs).
    if (h >= 22 || h < 2) {
      night += 1
      nightAmount += amt
    }
  }
  if (totalAmount === 0) return null
  const nightPct = (nightAmount / totalAmount) * 100
  if (nightPct < 70) return null
  return {
    id: 'night-impulse',
    emoji: '🌙',
    cat: 'Horario',
    title: `${Math.round(nightPct)}% de tu gasto es de noche`,
    body: `${night} de tus ${discretionary.length} compras fueron después de las 22hs — suman ${fmt(nightAmount)}. Revisar el carrito antes de dormir suele bajar ese ratio.`,
    impact: `Cortar 20% = +${fmt(nightAmount * 0.2)}/mes`,
    impactRaw: Math.round(nightAmount * 0.2),
    cta: 'Lo voy a notar',
    urgency: 'media',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Las compras nocturnas (después de las 22hs) suelen ser más impulsivas — delivery, cosas en apps. Si la mayoría de tus gastos caen ahí, conviene notarlo: revisar el carrito al otro día suele cortar la mitad.',
    action: { kind: 'dismiss', dismissId: 'night-impulse' },
  }
}

/** Same amount repeating on different days, NOT already a fijo. */
function buildUndetectedSubscription(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 4) return null
  // Bucket by amount rounded to 50 (tighter than before — was 100).
  const buckets = new Map<number, Array<{ day: number; desc: string }>>()
  for (const e of discretionary) {
    const bucket = Math.round(Number(e.price ?? 0) / 50) * 50
    if (bucket < 1000) continue
    const day = new Date(e.created_at).getDate()
    const arr = buckets.get(bucket) ?? []
    arr.push({ day, desc: e.description ?? '' })
    buckets.set(bucket, arr)
  }
  // Look for an amount that appears ≥2 times on different days.
  for (const [amount, entries] of buckets.entries()) {
    if (entries.length < 2) continue
    const uniqueDays = new Set(entries.map((e) => e.day)).size
    if (uniqueDays < 2) continue
    const desc = entries.find((e) => e.desc)?.desc ?? ''
    return {
      id: `undetected-sub-${amount}`,
      emoji: '🔁',
      cat: 'Suscripciones',
      title: `Posible suscripción sin registrar: ${fmt(amount)}`,
      body: `Detecté ${entries.length} gastos del mismo monto${desc ? ` ("${desc.slice(0, 40)}")` : ''}. Si se repite todos los meses, registrarlo como fijo te lo muestra mejor.`,
      impact: `Registrar = control`,
      impactRaw: amount * 12, // value of having it tracked over a year
      cta: 'Convertir',
      urgency: 'baja',
      // Confidence ramps with closed days (T3 — needs ~21 days).
      confidence: rampThreeWeeks(args.view.detalleDias.length),
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Detectamos un monto que se repite en distintos días — típico patrón de una suscripción que entraste como gasto normal. Si la registrás como "fijo", aparece en compromisos y la podés trackear mejor.',
      action: {
        kind: 'open-add-fixed-prefilled',
        amount,
        description: desc || undefined,
      },
    }
  }
  return null
}

// ─── Group 4 — Pattern insights (merged dow + weekend) ──────────────

/**
 * Weekly pattern — single signal that surfaces the strongest weekly
 * spending pattern: either a specific worst day-of-week, or a
 * weekend-vs-weekday premium. We pick whichever has the larger
 * monthly impact and only show the most actionable framing.
 */
function buildWeeklyPattern(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const { porDowEnriched, peorDow, globalAvg } = args.view
  if (!porDowEnriched || porDowEnriched.length < 7 || globalAvg <= 0) return null

  // ── Candidate A: worst single DoW
  let dowExtra = 0
  let dowName = ''
  if (peorDow && peorDow.avg > 0 && peorDow.ratio >= 1.4) {
    const monthlyOccurrences = 4
    dowExtra = (peorDow.avg - globalAvg) * monthlyOccurrences
    dowName =
      DOW_NAMES_FULL[dowIndexFromName(peorDow.name)] ?? peorDow.name.toLowerCase()
  }

  // ── Candidate B: weekend premium
  let wkExtra = 0
  let wkRatio = 0
  let wkdayAvgValue = 0
  let weekendAvgValue = 0
  const weekend = porDowEnriched.filter(
    (d) => (d.name === 'Sáb' || d.name === 'Dom') && d.avg > 0,
  )
  if (weekend.length > 0) {
    weekendAvgValue =
      weekend.reduce((s, d) => s + d.avg, 0) / weekend.length
    const weekday = porDowEnriched.filter(
      (d) => d.name !== 'Sáb' && d.name !== 'Dom' && d.avg > 0,
    )
    if (weekday.length > 0 && weekendAvgValue > 0) {
      wkdayAvgValue = weekday.reduce((s, d) => s + d.avg, 0) / weekday.length
      if (wkdayAvgValue > 0) {
        wkRatio = weekendAvgValue / wkdayAvgValue
        if (wkRatio >= 1.5) {
          wkExtra = (weekendAvgValue - wkdayAvgValue) * 8
        }
      }
    }
  }

  // Pick the strongest. Need 5k minimum impact to surface.
  const useDow = dowExtra >= wkExtra && dowExtra >= 5000
  const useWeekend = !useDow && wkExtra >= 8000
  if (!useDow && !useWeekend) return null

  if (useDow) {
    return {
      id: 'weekly-pattern',
      emoji: '🗓️',
      cat: 'Patrón',
      title: `Los ${dowName}s se te va la mano`,
      body: `Gastás ${peorDow!.ratio.toFixed(1)}× más que un día promedio. Si el próximo ${dowName} lo hacés en casa, ganás el equivalente a un día entero de cupo.`,
      impact: `+${fmt(dowExtra)}/mes`,
      impactRaw: Math.round(dowExtra),
      cta: 'Entendido',
      urgency: 'baja',
      confidence: rampThreeWeeks(args.view.detalleDias.length),
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Agrupamos tus gastos por día de semana y sacamos el promedio de cada uno. Así descubrimos si hay un día donde siempre te vas de mambo.',
      action: { kind: 'dismiss', dismissId: 'weekly-pattern' },
    }
  }

  // weekend
  return {
    id: 'weekly-pattern',
    emoji: '🎉',
    cat: 'Fin de semana',
    title: `Los findes cuestan ${Math.round((wkRatio - 1) * 100)}% más`,
    body: `De lunes a viernes promediás ${fmt(wkdayAvgValue)}/día; sáb-dom ${fmt(weekendAvgValue)}. Es donde más margen hay para emparejar.`,
    impact: `+${fmt(wkExtra)}/mes si emparejás`,
    impactRaw: Math.round(wkExtra),
    cta: 'Entendido',
    urgency: 'baja',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los sábados y domingos suelen tener salidas, delivery, planes con amigos — y gastás bastante más que los días de semana. Si bajás un poco, sumás al fin del mes sin sentir que te privás.',
    action: { kind: 'dismiss', dismissId: 'weekly-pattern' },
  }
}

// ─── Group 5 — Commitments & income health ──────────────────────────

/** Fijos-to-income ratio health check. */
function buildFijosRatioHealth(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.ingresoMes <= 0) return null
  const ratio = args.fijosMes / args.ingresoMes
  if (ratio < 0.6) return null
  const target = args.ingresoMes * 0.5
  const excess = args.fijosMes - target
  const severity: ControlAdvisorTask['urgency'] =
    ratio > 0.75 ? 'alta' : 'media'
  return {
    id: 'fijos-ratio',
    emoji: '⚖️',
    cat: 'Fijos',
    title: `Tus fijos son el ${Math.round(ratio * 100)}% del sueldo`,
    body: `Lo sano es ≤ 50%. Hoy cada $100 que entran, ${Math.round(ratio * 100)} ya están comprometidos antes de gastar nada. Revisá las suscripciones y los variables recurrentes.`,
    impact: `Bajar al 50% libera ${fmt(excess)}/mes`,
    impactRaw: Math.round(excess),
    cta: 'Ver fijos',
    urgency: severity,
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'La regla común dice que tus fijos no deberían pasar del 50% del sueldo, porque si suben no te queda margen para imprevistos. Te mostramos tu porcentaje para que sepas qué tan apretado estás.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' },
  }
}

/** Income volatility — current vs 3-month historical avg ±10%. */
function buildIncomeVolatility(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.summaries.length < 2) return null
  if (args.ingresoMes <= 0) return null
  const historicalAvg =
    args.summaries.slice(0, 3).reduce((s, x) => s + x.monthly_income, 0) /
    Math.min(3, args.summaries.length)
  if (historicalAvg === 0) return null
  const delta = args.ingresoMes - historicalAvg
  const pct = (delta / historicalAvg) * 100
  if (Math.abs(pct) < 10) return null
  const better = pct > 0
  const action: ControlAction = better
    ? { kind: 'open-savings-goal' }
    : { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' }
  return {
    id: 'income-volatility',
    emoji: better ? '📈' : '📉',
    cat: 'Ingreso',
    title: better
      ? `Tu ingreso subió ${pct.toFixed(0)}% vs el promedio`
      : `Tu ingreso bajó ${Math.abs(pct).toFixed(0)}% vs el promedio`,
    body: better
      ? `Pasaste de ${fmt(historicalAvg)} a ${fmt(args.ingresoMes)}. El libre subió — buen momento para empujar tu meta.`
      : `Pasaste de ${fmt(historicalAvg)} a ${fmt(args.ingresoMes)}. Tus fijos quedaron pesando más en proporción — revisalos.`,
    impact: fmtDelta(delta),
    impactRaw: Math.abs(Math.round(delta)),
    cta: better ? 'Ver meta' : 'Ver fijos',
    urgency: better ? 'baja' : 'media',
    confidence: rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Comparamos tu sueldo de este mes contra el promedio de los últimos 3 meses. Si subió, es buen momento para ahorrar más. Si bajó, ojo: tus fijos ahora son un porcentaje más grande de tu ingreso.',
    action,
  }
}

/** Translate zombie_alert notifications (last 14d) into tasks. */
function buildFromZombieNotifications(
  args: BuildSignalsArgs,
  now: Date,
): ControlAdvisorTask[] {
  const cutoff = now.getTime() - 14 * DAY_MS
  const zombies = args.notifications.filter(
    (n) =>
      n.kind === 'zombie_alert' &&
      new Date(n.created_at).getTime() >= cutoff,
  )
  return zombies.slice(0, 2).map((n) => {
    const name = (n.metadata.name as string) ?? 'Una suscripción'
    const amount = Number(n.metadata.amount ?? 0)
    return {
      id: `zombie-${n.id}`,
      emoji: '🧟',
      cat: 'Suscripciones',
      title: `${name} no la venís usando`,
      body: `Pagás ${fmt(amount)} cada mes y hace más de 2 meses que no la abrís. Cancelando ahora te quedan ${fmt(amount * 12)} a fin de año.`,
      impact: `+${fmt(amount)}/mes`,
      impactRaw: Math.round(amount),
      cta: 'Cancelar',
      urgency: 'alta',
      confidence: 1.0, // explicit detection from server
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Las "zombis" son las suscripciones que seguís pagando aunque no las uses. Hace meses no tocás ésta — si no la necesitás, cada mes que la mantenés es plata tirada.',
      action: {
        kind: 'open-fixed-expense',
        fixedExpenseId: String(n.metadata.fixed_expense_id ?? ''),
      },
    }
  })
}

/** Translate price_hike notifications (last 7d) into tasks. */
function buildFromPriceHikeNotifications(
  args: BuildSignalsArgs,
  now: Date,
): ControlAdvisorTask[] {
  const cutoff = now.getTime() - 7 * DAY_MS
  const dismissed = args.dismissedHikes ?? {}
  const hikes = args.notifications.filter((n) => {
    if (n.kind !== 'price_hike') return false
    if (new Date(n.created_at).getTime() < cutoff) return false
    const fixedExpenseId = String(n.metadata.fixed_expense_id ?? '')
    if (!fixedExpenseId) return true
    const newAmount = Number(n.metadata.new_amount ?? 0)
    const dismissedAt = dismissed[fixedExpenseId]
    if (dismissedAt != null && dismissedAt === Math.round(newAmount)) {
      return false
    }
    return true
  })
  return hikes.slice(0, 2).map((n) => {
    const name = (n.metadata.name as string) ?? 'Un fijo'
    const prev = Number(n.metadata.previous_amount ?? 0)
    const next = Number(n.metadata.new_amount ?? 0)
    const pct = Number(n.metadata.delta_pct ?? 0)
    const delta = next - prev
    return {
      id: `hike-${n.id}`,
      emoji: '⚡',
      cat: 'Fijos',
      title: `${name} subió ${pct.toFixed(0)}%`,
      body: `Pasó de ${fmt(prev)} a ${fmt(next)}. En 12 meses, son ${fmt(delta * 12)} más. Si podés comparar o renegociar, vale la pena.`,
      impact: `${fmtDelta(-delta)}/mes si bajás`,
      impactRaw: Math.round(delta),
      cta: 'Comparar',
      urgency: 'baja',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Uno de tus pagos fijos subió. Los aumentos parecen chicos mes a mes, pero acumulados en un año suman bastante. Te avisamos para que puedas comparar o renegociar antes de que se normalice el precio alto.',
      action: {
        kind: 'open-fixed-expense',
        fixedExpenseId: String(n.metadata.fixed_expense_id ?? ''),
      },
    }
  })
}

// ─── Group 6 — Savings ──────────────────────────────────────────────

/** Savings goal feasibility check. */
function buildSavingsFeasibility(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  const missing = Math.max(0, goal.goalAmount - goal.currentAmount)
  if (missing <= 0) return null
  const months = goal.targetMonths ?? 0
  if (months <= 0) return null
  const monthlyNeeded = missing / months
  const monthlyActual = args.view.vault
  if (monthlyActual >= monthlyNeeded) return null
  const shortfall = monthlyNeeded - monthlyActual
  return {
    id: 'savings-feasibility',
    emoji: '🎯',
    cat: goal.title,
    title: `Falta ${fmt(shortfall)} para tu meta`,
    body: `Para ${goal.title} necesitás ahorrar ${fmt(monthlyNeeded)}/mes y este mes vas por ${fmt(monthlyActual)}. Si no lo recuperás, se estira el plazo.`,
    impact: `Suma ${fmt(shortfall)} este mes`,
    impactRaw: Math.round(shortfall),
    cta: 'Ver meta',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Si querés llegar a una meta en X meses, tenés que poner cierta plata cada mes. Esta regla compara cuánto pusiste vs cuánto pediría el plan. Mejor saberlo ahora que en el mes 11.',
    action: { kind: 'open-savings-goal' },
  }
}

/** Savings overachievement — ahead of plan. */
function buildSavingsOverachievement(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  const months = goal.targetMonths ?? 0
  if (months <= 0) return null
  const missing = Math.max(0, goal.goalAmount - goal.currentAmount)
  if (missing <= 0) return null
  const planned = missing / months
  const actual = args.view.vault
  if (actual <= planned * 1.15) return null
  const newMonths = Math.max(1, Math.round(missing / actual))
  const saved = months - newMonths
  if (saved < 1) return null
  return {
    id: 'savings-over',
    emoji: '🚀',
    cat: goal.title,
    title: `Vas ${saved} meses adelantado a tu meta`,
    body: `Este mes ahorraste ${fmt(actual)} cuando el plan pedía ${fmt(planned)}. A ese ritmo llegás a ${goal.title} en ${newMonths} meses en vez de ${months}.`,
    impact: `-${saved} meses`,
    impactRaw: Math.round(actual - planned),
    cta: 'Ver meta',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Este mes ahorraste más de lo que pedía tu plan. Si sostenés el ritmo, llegás antes a tu objetivo. Te mostramos en cuántos meses llegarías para que puedas ajustar la meta o agregar un extra.',
    action: { kind: 'open-savings-goal' },
  }
}

// ─── Group 7 — Family ───────────────────────────────────────────────

/** One member covers >70% of discretionary. */
function buildMemberContributionImbalance(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 5) return null
  const byMember = new Map<string, number>()
  for (const e of discretionary) {
    if (!e.created_by) continue
    byMember.set(
      e.created_by,
      (byMember.get(e.created_by) ?? 0) + Number(e.price ?? 0),
    )
  }
  if (byMember.size < 2) return null
  const total = [...byMember.values()].reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const sorted = [...byMember.entries()].sort((a, b) => b[1] - a[1])
  const [topId, topAmount] = sorted[0]!
  const pct = (topAmount / total) * 100
  if (pct < 70) return null
  return {
    id: `member-imbalance-${topId}`,
    emoji: '👥',
    cat: 'Familia',
    title: `Un miembro carga el ${Math.round(pct)}% del gasto`,
    body: `De los ${fmt(total)} gastados este mes, ${fmt(topAmount)} los puso una sola persona. Si es por comodidad, está bien; si no, puede valer la pena compartir.`,
    impact: `Reparto 50/50 = ${fmt(total / 2)}`,
    impactRaw: 0,
    cta: 'Avisar',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'En hogares compartidos a veces uno termina pagando casi todo por costumbre, no porque se acordó así. Te mostramos el split real para que lo hablen.',
    action: {
      kind: 'send-member-warning',
      targetUserId: topId,
      message: `Aviso: este mes pusiste el ${Math.round(pct)}% del gasto del hogar (${fmt(topAmount)} de ${fmt(total)}). Quizás quieran hablarlo.`,
    },
  }
}

// ─── Group 8 — Positive reinforcement ───────────────────────────────

function buildStreakEncouragement(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const racha = args.view.racha
  if (racha < 3) return null
  return {
    id: 'streak-ok',
    emoji: '🔥',
    cat: 'Racha',
    title: `${racha} días seguidos bajo cupo`,
    body: `Venís sosteniendo el ritmo. A este paso, al cierre del mes vas a haber guardado ${fmt(
      Math.max(0, args.view.sobrantePresupuestadoMes),
    )}. Seguí así un día más.`,
    impact: `Plata del día: ${fmt(args.cupoDiario)}`,
    impactRaw: 0,
    cta: '¡Gracias!',
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Una racha son días seguidos en los que no te pasaste del tope. Como ir al gimnasio: la primera semana cuesta, después te acostumbrás. Te mostramos la racha para que veas el progreso.',
    action: { kind: 'dismiss', dismissId: 'streak-ok' },
  }
}

// ─── helpers ────────────────────────────────────────────────────────

function pushIfDefined<T>(arr: T[], value: T | null | undefined) {
  if (value) arr.push(value)
}

function urgencyWeight(u: 'alta' | 'media' | 'baja'): number {
  return u === 'alta' ? 3 : u === 'media' ? 2 : 1
}

function fmt(n: number): string {
  const round = Math.round(Math.abs(n))
  return '$' + round.toLocaleString('es-AR')
}

function fmtDelta(n: number): string {
  const sign = n > 0 ? '+' : '−'
  return `${sign}${fmt(n)}`
}

function dowIndexFromName(name: string): number {
  switch (name) {
    case 'Lun': return 0
    case 'Mar': return 1
    case 'Mié': return 2
    case 'Jue': return 3
    case 'Vie': return 4
    case 'Sáb': return 5
    case 'Dom': return 6
    default: return 0
  }
}

function groupExpensesByCategory(
  expenses: Expense[],
  categories: Category[],
): Array<{ id: string; name: string; amount: number }> {
  const byId = new Map<string, number>()
  for (const e of expenses) {
    if (e.commitment_id) continue
    byId.set(
      e.category_id,
      (byId.get(e.category_id) ?? 0) + Number(e.price ?? 0),
    )
  }
  return Array.from(byId.entries()).map(([id, amount]) => ({
    id,
    name: categories.find((c) => c.id === id)?.name ?? 'Otros',
    amount,
  }))
}

function groupExpensesByCategoryId(expenses: Expense[]): Map<string, number> {
  const byId = new Map<string, number>()
  for (const e of expenses) {
    if (e.commitment_id) continue
    byId.set(
      e.category_id,
      (byId.get(e.category_id) ?? 0) + Number(e.price ?? 0),
    )
  }
  return byId
}

/**
 * True when ≥70% of a category's cycle spend happened in the last 7
 * days. Suggests the rise is a single event, not a habit shift.
 */
function isCategorySpike(
  expenses: Expense[],
  categoryId: string,
  now: Date,
): boolean {
  const cutoff = now.getTime() - 7 * DAY_MS
  let last7 = 0
  let total = 0
  for (const e of expenses) {
    if (e.commitment_id) continue
    if (e.category_id !== categoryId) continue
    const amt = Number(e.price ?? 0)
    total += amt
    if (new Date(e.created_at).getTime() >= cutoff) last7 += amt
  }
  if (total === 0) return false
  return last7 / total >= 0.7
}

function avgCategoryFromSummaries(
  summaries: MonthlySummaryHistory[],
  categoryName: string,
): number {
  if (summaries.length === 0) return 0
  let total = 0
  let count = 0
  for (const s of summaries) {
    const breakdown = s.category_breakdown
    if (!breakdown) continue
    let amount: number | null = null
    if (Array.isArray(breakdown)) {
      const match = breakdown.find((e) => e.name === categoryName)
      amount = match ? Number(match.total ?? 0) : null
    } else {
      const bucket = (breakdown as Record<string, { amount?: number }>)[categoryName]
      amount = bucket?.amount != null ? Number(bucket.amount) : null
    }
    if (amount != null) {
      total += amount
      count += 1
    }
  }
  return count > 0 ? total / count : 0
}

function stressTitle(level: VelocitySnapshot['stress_level']): string {
  switch (level) {
    case 'critical':
      return 'Vas a cerrar muy apretado'
    case 'warn':
      return 'Estás por encima del objetivo'
    case 'watch':
      return 'Ritmo alto — conviene mirarlo'
    default:
      return 'Ritmo estable'
  }
}

export type { DayDetail, DowBucket }
