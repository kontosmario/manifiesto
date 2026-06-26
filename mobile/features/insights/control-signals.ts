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
//  - español latinoamericano neutro, tuteo directo ("tú", "tienes", "mira")
//  - cap output at 5 — Asesor card is designed for 3-5 items
//
// Data tiers (for confidence scoring):
//   T0 real-time: confidence 1.0 — no historical baseline needed
//   T1 1 cycle:   confidence ramps closedDays/14
//   T2 3 cycles:  confidence × min(1, summaries/3)
//   T3 60-day:    confidence ramps closedDays/21

import type { Expense } from '@/features/expenses/expense-repository'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { parseFixedExpenseDate } from '@/features/fixed-expenses/commitment-date-utils'
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
import { composeMomentumImpact } from '@/features/insights/momentum-impact'
import type { UserBaselines } from '@/features/insights/user-baselines'
import type { Forecast7Day } from '@/features/insights/forecast-engine'
import type { UserPersona } from '@/features/insights/persona'
import { framingFor } from '@/features/insights/persona'
import { signalFamilyOf } from '@/features/insights/signal-family'
import {
  scoreSubscriptionUsage,
  type SubscriptionCheckin,
} from '@/features/subscriptions-zombie/usage-checkin'
import {
  recoveryHardBody,
  velocityBody,
  fijosRatioBody,
  positiveForecastBody,
} from '@/features/insights/control-signals-copy'
import { DAY_MS } from '@/utils/time'

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
  /** Ingreso RECURRENTE del ciclo (sueldo, SIN los income_events
   *  one-time como transferencias o sobrantes). Lo usa `income-missing`
   *  para mostrar el cobro esperado REAL: los extras ya llegaron y no
   *  son el cobro que se está esperando. Fallback a `ingresoMes`. */
  ingresoRecurrente?: number
  fijosMes: number
  /** Optional 7-day rolling forecast (cognitive layer P1).
   *  When present, the predictive builders (`forecast-*`) consume it. */
  forecast?: Forecast7Day | null
  /** Inferred persona (cognitive layer P2). Builders that have copy
   *  variants (recovery-hard, velocity, fijos-ratio, positive-forecast)
   *  swap the `body` accordingly. Defaults to `'planner'` (neutral
   *  framing) when omitted. */
   persona?: UserPersona
  /** True when today is past the user's expected payday but they
   *  haven't yet confirmed receipt — drives `income-missing`. */
  paydayPending?: boolean
  /** Per-user blocked signal families (cognitive layer P3). Signals
   *  whose `signalFamilyOf(id)` matches any entry are dropped from
   *  the surface entirely — the user has explicitly opted out. */
  blockedFamilies?: ReadonlySet<string>
  /** Persisted per-device dismiss map keyed by fixed_expense_id →
   *  price-at-dismissal. */
  dismissedHikes?: Record<string, number>
  /** Per-user calibration baselines. When ≥3 cycles closed, this
   *  replaces hardcoded thresholds (e.g. cat-dominance 40%) with
   *  the user's own P75 — what's "normal" for them. */
  baselines?: UserBaselines
  /** Subs (categoría 'Suscripciones', status active) derivadas server-side
   *  SIN ventana de ciclo, inyectadas por useControlV2Data desde home_snapshot.
   *  El builder `buildSubUsageCheckin` decide qué preguntar. */
  subscriptionCheckins?: SubscriptionCheckin[]
  now?: Date
}

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

// ─── builder ────────────────────────────────────────────────────────

export function buildControlSignals(
  args: BuildSignalsArgs,
): ControlAdvisorTask[] {
  const now = args.now ?? new Date()
  const signals: ControlAdvisorTask[] = []

  // Curación 2026-06-15 (set para usuario común, supervivencia primero):
  // se descartaron start-splurge, undetected-sub, member-imbalance,
  // forecast-tomorrow-risk, forecast-storm-week y las 3 causal-* (complejas/
  // nicho/avanzadas). Ver docs/superpowers/specs/...-senales-curadas.

  // Group 1 — Cycle mechanics
  pushIfDefined(signals, buildStressWeek(args, now))
  pushIfDefined(signals, buildPaydayProximity(args))
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

  // Group 4 — Pattern insights (dow + weekend merged into weekly-pattern)
  pushIfDefined(signals, buildWeeklyPattern(args))

  // Group 5 — Commitments & income health
  pushIfDefined(signals, buildFijosRatioHealth(args))
  pushIfDefined(signals, buildIncomeVolatility(args))
  signals.push(...buildSubUsageCheckin(args, now))
  signals.push(...buildFromPriceHikeNotifications(args, now))

  // Group 6 — Savings & goals
  pushIfDefined(signals, buildSavingsFeasibility(args))
  pushIfDefined(signals, buildSavingsOverachievement(args))

  // Group 8 — Positive reinforcement
  pushIfDefined(signals, buildStreakEncouragement(args))

  // Group 9 — Atomic awareness (P1)
  pushIfDefined(signals, buildHighSingleExpense(args))
  pushIfDefined(signals, buildDuplicateMerchant(args))
  pushIfDefined(signals, buildDataGapWarning(args))
  pushIfDefined(signals, buildSavingsMilestone(args))
  pushIfDefined(signals, buildCycleStartProjection(args))
  pushIfDefined(signals, buildIncomeMissing(args))

  // Group 10 — Forecast (P1)
  pushIfDefined(signals, buildForecastPaydayGap(args))

  // Drop low-confidence, fuse related signals into richer single
  // cards, then rerank by urgency × annualizedImpact × confidence
  // and apply a diversity budget so a single domain can't monopolize
  // the top slots.
  // ControlView doesn't expose diasMes directly — derive it from
  // closed days + days remaining (matches both mock and adapter).
  const cycleDays = Math.max(
    1,
    args.view.detalleDias.length + args.view.diasRestantes,
  )
  const blocked = args.blockedFamilies
  const filtered = signals.filter((s) => {
    if (s.confidence < MIN_CONFIDENCE) return false
    // Hard mute: a user who blocked a family never sees signals of
    // that family again until they unblock it. Family resolution
    // collapses dynamic prefixes (zombie-* → 'zombie', etc.).
    if (blocked && blocked.size > 0 && blocked.has(signalFamilyOf(s.id))) {
      return false
    }
    return true
  })
  const fused = fuseSignals(filtered)
  const composed = composeSuperSignals(fused)
  const ranked = composed
    .sort((a, b) => {
      const sa =
        urgencyWeight(a.urgency) *
        Math.max(1, annualizedImpact(a, cycleDays)) *
        a.confidence
      const sb =
        urgencyWeight(b.urgency) *
        Math.max(1, annualizedImpact(b, cycleDays)) *
        b.confidence
      if (sb !== sa) return sb - sa
      // Stable tiebreak: annualized impact → urgency → id (lexicographic)
      const ia = annualizedImpact(a, cycleDays)
      const ib = annualizedImpact(b, cycleDays)
      if (ib !== ia) return ib - ia
      const ua = urgencyWeight(a.urgency)
      const ub = urgencyWeight(b.urgency)
      if (ub !== ua) return ub - ua
      return a.id.localeCompare(b.id)
    })
  return reserveProgressSlot(applyDiversityBudget(ranked), 5).slice(0, 5)
}

// Señales de "progreso" (victorias). Curación 2026-06-15: reservamos 1 lugar
// visible para una de estas cuando exista, para no abrumar con puras alertas
// rojas — el usuario tiene que ver que TAMBIÉN progresa, no solo problemas.
const PROGRESS_IDS = new Set([
  'streak-ok',
  'positive-forecast',
  'savings-milestone',
  'cat-win',
  'super-savings-momentum',
])

// Si el top visible no trae ninguna señal de progreso pero hay una más abajo,
// la sube al último lugar visible (empuja la alerta menos prioritaria fuera).
function reserveProgressSlot(
  list: ControlAdvisorTask[],
  cap: number,
): ControlAdvisorTask[] {
  if (list.length <= cap) return list
  if (list.slice(0, cap).some((s) => PROGRESS_IDS.has(s.id))) return list
  const idx = list.findIndex((s) => PROGRESS_IDS.has(s.id))
  if (idx < 0) return list
  const next = [...list]
  const [progress] = next.splice(idx, 1)
  next.splice(cap - 1, 0, progress)
  return next
}

// ─── annualized impact ──────────────────────────────────────────────
//
// Compares signals on a common time horizon so a one-shot $50k zombie
// doesn't out-rank a $30k/mes velocity warning. `impactScope` defaults
// to 'monthly' to preserve current behavior for builders that haven't
// been migrated yet.
function annualizedImpact(
  s: ControlAdvisorTask,
  cycleDays: number,
): number {
  const scope = s.impactScope ?? 'monthly'
  const raw = Math.abs(s.impactRaw)
  switch (scope) {
    case 'monthly':
      return raw * 12
    case 'oneTime':
      return raw
    case 'cycle':
      return (raw * 365) / Math.max(1, cycleDays)
  }
}

// ─── diversity budget ───────────────────────────────────────────────
//
// Caps the surface so a single tone (e.g. three "alta" criticals on the
// same category) can't crowd out other dimensions. Keeps at most 3 of
// any urgency, and at most 1 reinforcement (positive) signal per cycle.
const REINFORCEMENT_IDS = new Set([
  'streak-ok',
  'cat-win',
  'savings-over',
  'positive-forecast',
])

/** Hard cap on super-signals per surface — they're aggregations of
 *  multiple atomics, more than 2 in one view buries the lead. */
const MAX_SUPER_SIGNALS = 2

function applyDiversityBudget(
  ranked: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  let altaCount = 0
  let mediaCount = 0
  let bajaCount = 0
  let reinforcementCount = 0
  let superCount = 0
  const kept: ControlAdvisorTask[] = []
  for (const s of ranked) {
    const isSuper = s.id.startsWith('super-')
    if (isSuper && superCount >= MAX_SUPER_SIGNALS) continue
    const isReinforcement = REINFORCEMENT_IDS.has(s.id)
    if (!isSuper && isReinforcement && reinforcementCount >= 1) continue
    if (s.urgency === 'alta' && altaCount >= 3) continue
    if (s.urgency === 'media' && mediaCount >= 3) continue
    if (s.urgency === 'baja' && bajaCount >= 3) continue
    kept.push(s)
    if (isSuper) superCount++
    if (!isSuper && isReinforcement) reinforcementCount++
    if (s.urgency === 'alta') altaCount++
    else if (s.urgency === 'media') mediaCount++
    else bajaCount++
  }
  return kept
}

// ─── F8 — signal fusion ─────────────────────────────────────────────
//
// When two related signals fire about the same domain we keep only
// the higher-priority one and enrich its body with the other's
// finding. Stacking duplicates wastes attention; one richer card
// reads as "this is the real pattern" instead of two disjoint warnings.
//
// Patterns we fuse today:
//  · cat-accel + cat-dominance on same category → keep accel,
//    prepend "ya pesa N% del mes" context.
//  · recovery-hard + velocity → drop velocity (recovery-hard is
//    already telling the user to readjust).
function fuseSignals(
  tasks: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // cat-accel ⊕ cat-dominance (same category)
  const catAccel = byId.get('cat-accel')
  if (catAccel) {
    const dominanceKey = Array.from(byId.keys()).find(
      (k) => k.startsWith('cat-dominance-') && byId.get(k)?.cat === catAccel.cat,
    )
    if (dominanceKey) {
      const dominance = byId.get(dominanceKey)!
      // Pull the % straight from the dominance title (always shaped
      // like "<cat>: NN% del gasto…"). If the parse fails, drop the
      // share-sentence rather than silently invent "40%" — lying with
      // a fake number was the original bug.
      const sharePct = dominance.title.match(/(\d+)%/)?.[1]
      const sharePhrase = sharePct
        ? ` Además, ya se lleva el ${sharePct}% de todo lo que gastaste este mes: es donde más puedes ahorrar.`
        : ''
      const merged: ControlAdvisorTask = {
        ...catAccel,
        body: `${catAccel.body}${sharePhrase}`,
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

// ─── Super-signal composition (P1) ──────────────────────────────────
//
// A super-signal groups 2-3 individually-firing atomic signals that
// share an underlying narrative (a "perfect storm" of stress factors,
// a positive momentum confluence, a hidden-drain pattern). When the
// composition rule matches, we generate a single richer card and drop
// the constituents — that single card communicates the gestalt better
// than three separate ones, and frees space in the diversity budget.

function tryComposePerfectStorm(
  byId: Map<string, ControlAdvisorTask>,
): ControlAdvisorTask | null {
  const fijos = byId.get('fijos-ratio')
  // `velocity` may have been dropped by `fuseSignals` when
  // `recovery-hard` is present (the two are redundant). Treat it as
  // optional so the storm still composes in exactly that scenario —
  // we just need ≥2 of {fijos, velocity, recovery} to fire.
  const velocity = byId.get('velocity') ?? null
  const recovery =
    byId.get('recovery-hard') ?? byId.get('recovery-soft') ?? null
  const present = [fijos, velocity, recovery].filter(
    (t): t is ControlAdvisorTask => Boolean(t),
  )
  if (present.length < 2) return null
  const altaCount = present.filter((t) => t.urgency === 'alta').length
  if (altaCount < 2) return null
  const composedOf = present.map((t) => t.id)
  for (const id of composedOf) byId.delete(id)
  // Annualize each constituent according to its declared scope so the
  // combined carga is comparable to other annualized signals.
  const annualizedSum = present.reduce((sum, t) => {
    const scope = t.impactScope ?? 'monthly'
    if (scope === 'monthly') return sum + t.impactRaw * 12
    return sum + t.impactRaw // oneTime / cycle treated at face value
  }, 0)
  const titleSummary = present.map((t) => t.title.toLowerCase()).join(', ')
  return {
    id: 'super-perfect-storm',
    emoji: '🌪️',
    cat: 'Confluencia',
    title: 'Confluencia crítica',
    body: `${present.length === 3 ? 'Tres' : 'Dos'} factores se alinean: ${titleSummary}. Plan integral sugerido.`,
    impact: `Carga combinada: ${fmt(Math.round(annualizedSum * 1.2))}`,
    impactRaw: Math.round(annualizedSum * 1.2),
    impactScope: 'oneTime',
    cta: 'Plan integral',
    urgency: 'alta',
    confidence: Math.min(...present.map((t) => t.confidence)),
    dataDays: Math.max(...present.map((t) => t.dataDays)),
    dummyExplanation:
      'Cuando los fijos pesan demasiado y al mismo tiempo gastas más de lo que tienes disponible hoy o aceleraste el gasto en los últimos días, no es un problema aislado: es la suma. El plan integral baja a la vez la presión estructural y el día a día.',
    composedOf,
    action: { kind: 'open-coach-mode', signalId: 'super-perfect-storm', topic: 'crisis' },
  }
}

function tryComposeSavingsMomentum(
  byId: Map<string, ControlAdvisorTask>,
): ControlAdvisorTask | null {
  const streak = byId.get('streak-ok')
  const positive = byId.get('positive-forecast')
  const reinforcer =
    byId.get('cat-win') ?? byId.get('savings-over')
  if (!streak || !positive || !reinforcer) return null
  const composedOf = [streak.id, positive.id, reinforcer.id]
  for (const id of composedOf) byId.delete(id)
  // Headline magnitude comes from the cycle-scoped excedente alone.
  // See `momentum-impact.ts` for the rationale — folding the
  // reinforcer's monthly figure (× 12 was the old behavior) inflated
  // the number into fantasy ("+$770k a favor" for a healthy account).
  const headline = composeMomentumImpact(positive)
  return {
    id: 'super-savings-momentum',
    emoji: '🚀',
    cat: 'Racha',
    title: 'Racha positiva',
    body: `Llevas racha sostenida, el mes cierra con plata de sobra, y hay categorías a favor. Es el momento de aprovechar: subir la meta o reasignar lo que sobra.`,
    impact: headline.label,
    impactRaw: headline.impactRaw,
    impactScope: headline.impactScope,
    cta: 'Capitalizar',
    urgency: 'baja',
    confidence: Math.min(streak.confidence, positive.confidence, reinforcer.confidence),
    dataDays: Math.max(streak.dataDays, positive.dataDays, reinforcer.dataDays),
    dummyExplanation:
      'La combinación de tres señales positivas a la vez — racha, plata que sobra y win por categoría — sostiene un cambio real. Buen momento para subir la meta o destinar lo que sobra.',
    composedOf,
    action: { kind: 'open-savings-goal' },
  }
}

function composeSuperSignals(
  tasks: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const supers: ControlAdvisorTask[] = []
  // Curación 2026-06-15: solo 2 meta-señales (colapsan señales hijas en 1
  // card → bajan ruido, no lo suman). super-hidden-drain ("drenaje
  // invisible") descartado: framing pseudo-técnico que no le dice a la
  // persona qué auditar; sus hijas (small-leaks, cat-dominance) ya viven
  // claras y sueltas.
  const storm = tryComposePerfectStorm(byId)
  if (storm) supers.push(storm)
  const momentum = tryComposeSavingsMomentum(byId)
  if (momentum) supers.push(momentum)
  return [...supers, ...byId.values()]
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
    // `parseFixedExpenseDate` parses bare `YYYY-MM-DD` as local-day
    // midnight. The naive `new Date(...)` shifts to UTC and drops
    // fijos one day early in negative-UTC timezones — same bug the
    // Próximo fijo chip's helper guards against.
    const dueDate = parseFixedExpenseDate(f.next_due_on)
    if (!dueDate) return false
    return dueDate >= now && dueDate <= cutoff
  })
  if (due.length < 3) return null
  const total = due.reduce((s, f) => s + Number(f.amount ?? 0), 0)
  const names = due.slice(0, 3).map((f) => f.name).filter(Boolean).join(', ')
  return {
    id: 'stress-week',
    emoji: '📅',
    cat: 'Fijos',
    title: `${due.length} pagos fijos vencen en 7 días`,
    body: `${names}${due.length > 3 ? ` y ${due.length - 3} más` : ''} suman ${fmt(total)}. Es mejor reservar ese monto para evitar imprevistos.`,
    impact: `Reservar ${fmt(total)}`,
    impactRaw: total,
    impactScope: 'cycle',
    cta: 'Ver fijos',
    urgency: 'alta',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Un "fijo" es un pago mensual recurrente (alquiler, servicios, suscripciones). Cuando varios caen en la misma semana, quedan menos pesos disponibles para gastos del día a día. Avisamos con anticipación para evitar sorpresas.',
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
    cat: 'Hasta el cobro',
    title: `Te quedan ${fmt(remaining)} y faltan ${args.diasRestantes} días al cobro`,
    body: `Para llegar bien al próximo cobro, gasta hasta ${fmt(sustainable)} por día.`,
    impact: `Hasta ${fmt(sustainable)} por día`,
    impactRaw: Math.round((args.cupoDiario - sustainable) * args.diasRestantes),
    impactScope: 'cycle',
    cta: 'Entendido',
    urgency: sustainable < args.cupoDiario * 0.5 ? 'alta' : 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Es lo que te queda dividido por los días hasta el próximo cobro: cuánto puedes gastar por día para no quedar en cero.',
    action: { kind: 'dismiss', dismissId: 'payday-proximity' },
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
    title: `Vienes gastando ${fmt(last3Avg)}/día, por encima de tu promedio`,
    body: `Estos últimos 3 días gastaste ${fmt(last3Avg)}/día contra ${fmt(cycleAvg)}/día del resto del mes. Quedan ${args.diasRestantes} días — a este paso, el mes termina en rojo.`,
    impact: `Volver al promedio: ${fmtDelta(-extra)}`,
    impactRaw: Math.round(extra),
    impactScope: 'cycle',
    cta: 'Entendido',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Es común aflojar el control al final del mes, justo cuando el gasto se dispara más. Comparar los últimos 3 días contra el promedio del mes ayuda a detectar el cambio a tiempo.',
    action: { kind: 'dismiss', dismissId: 'end-acceleration' },
  }
}

/** If overspending today, compute a recovery-friendly new daily cap. */
function buildRecoveryPath(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  // Gate por `libreHoy < 0` (sobregiro REAL: gastoHoy > cupoDiario
  // completo del día), NO por `delta < 0` (pro-rated por hora). El
  // delta pro-rated triggereaba SOBREGIRO falsos a primera hora del
  // día: e.g. cargar \$15K a las 00:27 con cupo \$183K → libreHoy = $168K
  // (bien) pero delta = -\$11.5K (mal) porque cupoHastaAhora a esa hora
  // es solo \$3.4K. El user quedaba con "SOBREGIRO \$11K" cuando todavía
  // tenía el día entero por delante. Owner feedback 2026-06-08.
  if (args.view.libreHoy >= 0) return null
  if (args.diasRestantes <= 1) return null
  const overspend = Math.abs(args.view.libreHoy)
  const newCupo = args.cupoDiario - overspend / args.diasRestantes
  if (newCupo < args.cupoDiario * 0.4) {
    const framing = framingFor(args.persona ?? 'planner')
    return {
      id: 'recovery-hard',
      emoji: '🧭',
      cat: 'Recuperación',
      title: 'Hoy te pasaste bastante',
      body: recoveryHardBody(framing, {
        newCupo: fmt(newCupo),
        diasRestantes: args.diasRestantes,
        overspend: fmt(overspend),
      }),
      impact: `A recuperar: ${fmt(overspend)}`,
      impactRaw: Math.round(overspend),
      impactScope: 'oneTime',
      cta: 'Ajustar',
      urgency: 'alta',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Cuando gastas mucho más de lo disponible hoy, bajar mucho lo que puedes gastar el resto del mes no funciona. Mejor reajustar la meta de ahorro o reordenar algún gasto fijo antes que sostener un objetivo imposible.',
      action: { kind: 'open-settings-modal', modal: 'savings-percent' },
    }
  }
  return {
    id: 'recovery-soft',
    emoji: '🧭',
    cat: 'Recuperación',
    title: 'Ajusté lo que puedes gastar por día',
    body: `Hoy te pasaste por ${fmt(overspend)}. Si de aquí a fin de mes gastas ${fmt(newCupo)}/día, el mes igual cierra bien.`,
    impact: `Nuevo límite: ${fmt(newCupo)}/día`,
    impactRaw: Math.round(overspend),
    impactScope: 'oneTime',
    cta: 'Entendido',
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando el exceso es moderado, se reparte entre los días que quedan y queda un límite diario un poco más bajo. Si se mantiene ese límite, el mes cierra dentro del presupuesto.',
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
  // Compare the cycle-close forecast against the cycle's *budget*
  // (libreMes = cupoDiario × diasMes), NOT against `gastoProyectadoMes`.
  // The previous version subtracted two projections that came from
  // different definitions of "the cycle" (backend = calendar month,
  // frontend = pay cycle), so `over` had no coherent economic meaning
  // and could surface absurd "Frenar: −$4M" deltas. The correct
  // overshoot is `forecast − presupuesto del ciclo`.
  const libreMes =
    args.cupoDiario *
    (args.view.diasRestantes + args.view.detalleDias.length)
  const over = v.forecast_close_amount - libreMes
  const urgency: ControlAdvisorTask['urgency'] =
    v.stress_level === 'critical'
      ? 'alta'
      : v.stress_level === 'warn'
        ? 'media'
        : 'baja'
  const framing = framingFor(args.persona ?? 'planner')
  return {
    id: 'velocity',
    emoji: '⏱️',
    cat: 'Ritmo',
    title: stressTitle(v.stress_level),
    body: velocityBody(framing, {
      forecast: fmt(v.forecast_close_amount),
      momentumPct: Math.max(0, Math.round((v.momentum - 1) * 100)),
      faster: v.momentum > 1,
      over: over > 0 ? fmt(over) : null,
    }),
    impact: over > 0 ? `Frenar: ${fmtDelta(-over)}` : 'Mantener el ritmo de gasto',
    impactRaw: Math.max(0, Math.round(over)),
    impactScope: 'oneTime',
    cta: 'Entendido',
    urgency,
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara el ritmo de gasto reciente (últimos 7 días) contra el promedio del mes. Si el gasto se aceleró, estima el monto de cierre para anticipar el resultado del mes.',
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
  const framing = framingFor(args.persona ?? 'planner')
  return {
    id: 'positive-forecast',
    emoji: '🌱',
    cat: 'Cierre',
    title: `Plata que te sobra: ${fmt(sobra)}`,
    body: positiveForecastBody(framing, {
      sobra: fmt(sobra),
      proposed: hasActiveGoal && proposed > 0 ? fmt(proposed) : null,
      goalTitle: hasActiveGoal && args.savingsGoal ? args.savingsGoal.title : null,
      diasRestantes: args.diasRestantes,
    }),
    impact: hasActiveGoal && proposed > 0
      ? `+${fmt(proposed)} a la meta`
      : `+${fmt(sobra)} al cierre`,
    impactRaw: Math.round(proposed > 0 ? proposed : sobra),
    impactScope: 'oneTime',
    cta: hasActiveGoal && proposed > 0 ? `Mover ${fmt(proposed)}` : 'Ver meta',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Estima el cierre del mes combinando el ritmo de gasto actual con los días restantes. Cuando el resultado es positivo, ve cuánta plata te sobra para la meta de ahorro o reserva.',
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
  const titleSuffix = spike ? ' (gasto puntual)' : ''
  const body = spike
    ? `Gastaste ${fmt(topNow.amount)} en ${topNow.name} este mes, contra ${fmt(historicalAvg)} de costumbre. Casi todo fue esta última semana — capaz algo puntual (un viaje, un regalo, una compra grande). ¿Fue eso o cambió algo?`
    : `Gastaste ${fmt(topNow.amount)} en ${topNow.name} este mes, contra ${fmt(historicalAvg)} de costumbre. Vino subiendo de a poco. ¿Quieres frenarlo o ya es parte de tus gastos?`
  return {
    id: 'cat-accel',
    emoji: spike ? '🎯' : '📈',
    cat: topNow.name,
    title: `${topNow.name} subió fuerte este mes${titleSuffix}`,
    body,
    impact: `Volver al promedio: ${fmtDelta(-delta)}/mes`,
    impactRaw: Math.round(delta),
    cta: 'Ver gastos',
    urgency: 'media',
    // 1 prior summary is weak evidence but the signal already gates on
    // `historicalAvg > 0`, so floor the summaries multiplier at 0.5
    // — otherwise rampOneCycle(14) × rampSummaries(1) = 0.33 falls
    // below MIN_CONFIDENCE and a fully-populated cycle gets dropped.
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      Math.max(0.5, rampSummaries(args.summaries.length)),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara lo que gastas ahora en una categoría con lo que sueles gastar. Verlo a tiempo te deja decidir si frenar o si es algo puntual.',
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
        ? `${name}: límite superado`
        : `${name} al ${pct}% del límite`,
      body: breach
        ? `Tu límite era ${fmt(limit.monthly_cap)} y llevas gastados ${fmt(spent)}. Exceso: ${fmt(spent - limit.monthly_cap)}.`
        : `Llevas ${fmt(spent)} de los ${fmt(limit.monthly_cap)} que pusiste como límite. Quedan ${fmt(limit.monthly_cap - spent)} para cerrar el mes.`,
      impact: breach
        ? `Frenar ahora: ${fmtDelta(-(spent - limit.monthly_cap))}`
        : `Mantener bajo ${fmt(limit.monthly_cap)}`,
      impactRaw: breach ? Math.round(spent - limit.monthly_cap) : 0,
      // Overshoot is for THIS cycle only — not a recurring monthly amount.
      impactScope: 'cycle',
      cta: 'Ver detalle',
      urgency: breach ? 'alta' : 'media',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Si pones un tope mensual a una categoría, la app avisa cuando te acercas o lo superas. Funciona como una meta personal: ayuda a frenar el gasto antes de que afecte el cierre del mes.',
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
  const save10 = top.amount * 0.1
  return {
    id: `cat-dominance-${top.id}`,
    emoji: '🎯',
    cat: top.name,
    title: `${top.name} se lleva ${fmt(top.amount)} de tu gasto`,
    body: `De los ${fmt(total)} que gastaste este mes, ${fmt(top.amount)} fueron en ${top.name}. Si gastas un poco menos ahí, se nota más que recortar en varias categorías chicas.`,
    impact: `Reducir 10%: +${fmt(save10)}/mes`,
    impactRaw: Math.round(save10),
    cta: 'Entendido',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando una categoría concentra casi la mitad del gasto, es donde más puedes ahorrar. Una reducción pequeña en esa categoría libera más dinero que varios ajustes chicos en otras.',
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
  // Scale the noise floor to income: 0.5% of monthly income with an
  // absolute floor of $1.000 so we don't fire on rounding-level
  // savings. Hardcoding $5.000 used to silence small-budget users
  // (where $5k is meaningful) and over-fire for high earners (where
  // $5k is noise). For ingresoMes=0 we keep the absolute floor.
  const minDelta = Math.max(1000, args.ingresoMes * 0.005)
  let bestWin: { name: string; now: number; avg: number; delta: number } | null = null
  for (const c of byCategory) {
    const avg = avgCategoryFromSummaries(args.summaries, c.name)
    if (avg === 0) continue
    const ratio = c.amount / avg
    if (ratio > 0.7) continue
    const delta = avg - c.amount
    if (delta < minDelta) continue
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
    title: `${bestWin.name} −${pct}% vs promedio`,
    body: `Gastaste ${fmt(bestWin.now)} este mes vs ${fmt(bestWin.avg)} de promedio. Si lo mantienes, son ${fmt(bestWin.delta * 12)} al año.`,
    impact: `+${fmt(bestWin.delta)}/mes sostenido`,
    impactRaw: Math.round(bestWin.delta),
    cta: 'Entendido',
    urgency: 'baja',
    // Floor the summaries multiplier at 0.5 — see cat-accel above.
    // The signal already gates on at least one prior summary with a
    // non-zero category avg; the multiplier shouldn't suppress the
    // signal entirely on a fully closed first cycle.
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      Math.max(0.5, rampSummaries(args.summaries.length)),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Detecta categorías donde el gasto del mes está claramente por debajo del promedio histórico. Mostrar el equivalente anual ayuda a sostener el cambio en el tiempo.',
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
    title: `${small.length} gastos pequeños suman ${fmt(total)}`,
    body: `Compras menores a $5.000 (kiosco, delivery, café) representan el ${Math.round(pctOfCycle * 100)}% del gasto del mes. Suelen pasar desapercibidas una por una.`,
    impact: `Reducir 30%: ${fmt(total * 0.3)}/mes`,
    impactRaw: Math.round(total * 0.3),
    cta: 'Ver detalle',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los gastos menores a $5.000 parecen insignificantes uno por uno, pero juntos suman una porción importante del mes. Verlos juntos ayuda a detectar dónde se concentra el "goteo" del presupuesto.',
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
    title: `${fmt(nightAmount)} en compras de noche`,
    body: `${night} de ${discretionary.length} compras las hiciste después de las 22hs, sumando ${fmt(nightAmount)}. De noche, relajado en casa, es más fácil comprar de más sin pensarlo.`,
    impact: `Reducir 20%: +${fmt(nightAmount * 0.2)}/mes`,
    impactRaw: Math.round(nightAmount * 0.2),
    cta: 'Entendido',
    urgency: 'media',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Comprar de noche, relajado en casa, suele llevar a gastar de más. Dejar la compra para el día siguiente ayuda a cortar varias de esas.',
    action: { kind: 'dismiss', dismissId: 'night-impulse' },
  }
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
  // Use actual cycle length to compute how many of this weekday fall
  // in a typical month — `cycleDays / 7` (≈ 4.28 for a 30-day cycle).
  // The hardcoded `* 4` was correct only for 28-day cycles and
  // under-counted impact by ~7% for longer cycles.
  const cycleDays =
    args.view.detalleDias.length + args.view.diasRestantes
  let dowExtra = 0
  let dowName = ''
  if (peorDow && peorDow.avg > 0 && peorDow.ratio >= 1.4) {
    const monthlyOccurrences = cycleDays / 7
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
          // 2 weekend days per 7-day week, scaled by actual cycle
          // length. Hardcoded `* 8` was correct for 28-day cycles
          // only; this generalizes (≈8.57 for a 30-day cycle).
          wkExtra =
            (weekendAvgValue - wkdayAvgValue) * (2 * cycleDays) / 7
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
      title: `Los ${dowName} gastas más`,
      body: `Los ${dowName} gastas bastante más que un día normal. En todo el mes, eso suma ${fmt(dowExtra)} de más.`,
      impact: `+${fmt(dowExtra)}/mes`,
      impactRaw: Math.round(dowExtra),
      cta: 'Entendido',
      urgency: 'baja',
      confidence: rampThreeWeeks(args.view.detalleDias.length),
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Agrupa el gasto por día de la semana y calcula el promedio de cada uno. Permite identificar el día que concentra el mayor gasto recurrente.',
      action: { kind: 'dismiss', dismissId: 'weekly-pattern' },
    }
  }

  return {
    id: 'weekly-pattern',
    emoji: '🎉',
    cat: 'Fin de semana',
    title: `Los findes gastas más`,
    body: `De lunes a viernes gastas ${fmt(wkdayAvgValue)} por día. Sábados y domingos, ${fmt(weekendAvgValue)} por día. Ahí es donde más puedes recortar.`,
    impact: `+${fmt(wkExtra)}/mes ajustando`,
    impactRaw: Math.round(wkExtra),
    cta: 'Entendido',
    urgency: 'baja',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los fines de semana concentran salidas, delivery y planes sociales que elevan el gasto promedio. Pequeños ajustes en sábado y domingo suman varios miles al cierre sin afectar el resto de la semana.',
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
  const framing = framingFor(args.persona ?? 'planner')
  return {
    id: 'fijos-ratio',
    emoji: '⚖️',
    cat: 'Fijos',
    title: `Tus pagos fijos pesan mucho`,
    body: fijosRatioBody(framing, {
      ratioPct: Math.round(ratio * 100),
      excess: fmt(excess),
      comprometidoPct: Math.round(ratio * 100),
    }),
    impact: `Bajando alguno: liberas ${fmt(excess)}/mes`,
    impactRaw: Math.round(excess),
    cta: 'Ver fijos',
    urgency: severity,
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando tus gastos fijos pasan la mitad del sueldo, te queda muy poco para imprevistos y ahorro.',
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
      ? `Cobraste ${fmt(args.ingresoMes)} este mes — más que de costumbre`
      : `Cobraste ${fmt(args.ingresoMes)} este mes — menos que de costumbre`,
    body: better
      ? `Otros meses cobrabas cerca de ${fmt(historicalAvg)}; este mes te entró ${fmt(Math.abs(delta))} más. Buen momento para guardar un poco de esa diferencia.`
      : `Otros meses cobrabas cerca de ${fmt(historicalAvg)}; este mes te entró ${fmt(Math.abs(delta))} menos. Cuida los gastos hasta que se recupere.`,
    impact: fmtDelta(delta),
    impactRaw: Math.abs(Math.round(delta)),
    cta: better ? 'Ver meta' : 'Ver fijos',
    urgency: better ? 'baja' : 'media',
    confidence: rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara lo que cobraste este mes con lo que sueles cobrar. Si entra bastante menos, conviene cuidar los gastos; si entra más, guarda la diferencia.',
    action,
  }
}

/**
 * Subscription usage check-in — pregunta por el uso REAL de una sub al pagar
 * y re-pregunta a ~15 días; escala a flag de cancelar si el uso es bajo.
 * Reemplaza el zombi por ausencia-de-pago (retirado 2026-06-23). Deriva todo
 * de `args.subscriptionCheckins` (server-side, ledger durable, sin ventana de
 * ciclo) vía `scoreSubscriptionUsage` (gate de cadencia, invariante 5).
 */
function buildSubUsageCheckin(
  args: BuildSignalsArgs,
  now: Date,
): ControlAdvisorTask[] {
  const checkins = args.subscriptionCheckins ?? []
  if (checkins.length === 0) return []
  const out: ControlAdvisorTask[] = []
  for (const c of checkins) {
    if (c.hasOpenCancelIntent) continue // ya en flujo de cancelación
    const score = scoreSubscriptionUsage(c, now)
    if (!score.shouldAsk) continue
    const id = `sub-usage-${c.fixedExpenseId}`
    let title: string
    let body: string
    let urgency: ControlAdvisorTask['urgency']
    let replies: ControlAdvisorTask['replies'] = [
      { label: 'Mucho', action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'mucho', dismissId: id } },
      { label: 'A veces', action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'a_veces', dismissId: id } },
      { label: 'Casi nunca', action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'casi_nunca', dismissId: id } },
    ]
    if (score.flag === 'hard') {
      title = `Vienes sin usar ${c.name} hace ~2 meses`
      body = `Respondiste que casi no usas ${c.name} y cuesta ${fmt(c.amount)}/mes. ¿Realmente necesitas pagarla? Cancelarla te ahorra ${fmt(c.amount * 12)} al año.`
      urgency = 'alta'
      replies = [
        { label: 'Cancelar', action: { kind: 'sub-usage-cancel', fixedExpenseId: c.fixedExpenseId, dismissId: id } },
        { label: 'La sigo usando', action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'mucho', dismissId: id } },
      ]
    } else if (score.flag === 'soft') {
      title = `${c.name}: ¿la estás aprovechando?`
      body = `Las últimas veces dijiste que la usas poco. Cuesta ${fmt(c.amount)}/mes — si no le sacas provecho, conviene revisarla.`
      urgency = 'media'
    } else if (score.prompt === 'pay') {
      title = `Pagaste ${c.name} · ¿cuánto la usaste?`
      body = `Registramos el pago de ${c.name} (${fmt(c.amount)}/mes). ¿Cuánto la usaste el último mes?`
      urgency = 'baja'
    } else {
      title = `¿Sigues usando ${c.name}?`
      body = `Hace un tiempo no nos cuentas cómo va ${c.name} (${fmt(c.amount)}/mes). ¿La sigues usando?`
      urgency = 'baja'
    }
    out.push({
      id,
      emoji: score.flag === 'hard' ? '🧟' : '📺',
      cat: 'Suscripciones',
      title,
      body,
      impact: `${fmt(c.amount)}/mes`,
      impactRaw: Math.round(c.amount),
      impactScope: 'monthly',
      cta: 'Responder',
      urgency,
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Te preguntamos por las suscripciones que pagas para ver si realmente las usas. Si vienes diciendo que no, te avisamos para que decidas si vale la pena seguir pagándolas.',
      replies,
    })
    if (out.length >= 2) break // cap 1-2, como el zombi
  }
  return out
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
      title: `${name}: aumento del ${pct.toFixed(0)}%`,
      body: `Pasó de ${fmt(prev)} a ${fmt(next)}. En 12 meses son ${fmt(delta * 12)} más. Comparar otros proveedores o renegociar puede recuperar parte del aumento.`,
      impact: `Hasta ${fmtDelta(-delta)}/mes negociando`,
      impactRaw: Math.round(delta),
      cta: 'Comparar',
      urgency: 'baja',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Detecta aumentos en los gastos fijos cuando se cargan. Los aumentos parecen chicos mes a mes, pero acumulados en un año suelen justificar buscar alternativas o renegociar con el proveedor.',
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
    title: `Para "${goal.title}" te faltan ${fmt(shortfall)} este mes`,
    body: `Para llegar a tiempo tendrías que guardar como ${fmt(monthlyNeeded / 4)} por semana. Este mes vas por ${fmt(monthlyActual)} — guarda un poco más y llegas.`,
    impact: `Te faltan ${fmt(shortfall)} este mes`,
    impactRaw: Math.round(shortfall),
    cta: 'Ver meta',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara lo que estás guardando este mes con lo que necesitas para llegar a tu meta a tiempo. Ajustar temprano hace el esfuerzo más chico.',
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
    title: `Meta adelantada en ${saved} ${saved === 1 ? 'mes' : 'meses'}`,
    body: `Este mes ahorraste ${fmt(actual)} cuando el plan pedía ${fmt(planned)}. A este ritmo, ${goal.title} llega en ${newMonths} meses en vez de ${months}.`,
    impact: `−${saved} ${saved === 1 ? 'mes' : 'meses'} al objetivo`,
    impactRaw: Math.round(actual - planned),
    cta: 'Ver meta',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando el ahorro mensual supera el plan, recalculamos la fecha estimada de cumplimiento. Puedes mantener el ritmo para llegar antes o subir la meta.',
    action: { kind: 'open-savings-goal' },
  }
}

// ─── Group 7 — Family ───────────────────────────────────────────────

// ─── Group 9 — Atomic awareness (P1) ────────────────────────────────
//
// Signals that don't depend on the cognitive layer (memory / causal /
// forecast). They are computed from the same `BuildSignalsArgs` as the
// rest and are registered in the main pipeline. Each has a stable id
// and respects the existing dismiss / cooldown / diversity-budget
// machinery.

function startOfLocalDay(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Single tx today >= 30% of daily cap. Pure-T0; alerts on the spot. */
function buildHighSingleExpense(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.cupoDiario <= 0) return null
  const today = startOfLocalDay(args.now ?? new Date())
  const todayExpenses = args.expenses.filter((e) => {
    // Excluir pagos de gastos fijos (commitment_id no-null): ya están
    // contemplados, no son "movimiento alto" sorpresa ni consumen el cupo
    // discrecional. Alinea esta señal con sus hermanas (small-leaks,
    // night-impulse, category) que ya filtran commitment_id.
    if (e.commitment_id) return false
    const ts = new Date(e.created_at).getTime()
    return ts >= today && ts < today + DAY_MS
  })
  if (todayExpenses.length === 0) return null
  let max = todayExpenses[0]
  for (const e of todayExpenses) if (Number(e.price ?? 0) > Number(max.price ?? 0)) max = e
  const price = Number(max.price ?? 0)
  if (price < args.cupoDiario * 0.3) return null
  const pct = Math.round((price / args.cupoDiario) * 100)
  return {
    id: 'high-single-expense',
    emoji: '💥',
    cat: 'Gasto único',
    title: `Movimiento alto hoy: ${fmt(price)}`,
    body: `Hoy registraste ${fmt(price)} en un solo movimiento — ${pct}% de lo que puedes gastar hoy (${fmt(args.cupoDiario)}). Mira si conviene compensar el resto del día.`,
    impact: `Hoy: ${fmt(price)}`,
    impactRaw: Math.round(price),
    impactScope: 'oneTime',
    cta: 'Ver detalle',
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando un solo gasto ocupa una porción grande de lo que puedes gastar hoy, el resto del día queda muy comprometido. Verlo apenas pasa permite reaccionar.',
    action: {
      kind: 'open-expenses-filtered',
      filter: { focusExpenseId: max.id },
    },
  }
}

/** Two expenses with same description (normalized) and similar price within 48h. */
function buildDuplicateMerchant(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const now = (args.now ?? new Date()).getTime()
  const cutoff = now - 48 * 60 * 60 * 1000
  const recent = args.expenses.filter(
    // Excluir pagos de fijos: dos pagos del mismo fijo (o un fijo + un gasto
    // manual con misma description y monto) no son un "duplicado" a revisar.
    (e) => !e.commitment_id && new Date(e.created_at).getTime() >= cutoff,
  )
  if (recent.length < 2) return null
  const seen = new Map<string, typeof recent>()
  for (const e of recent) {
    const key = (e.description ?? '').trim().toLowerCase()
    if (!key) continue
    const arr = seen.get(key) ?? []
    arr.push(e)
    seen.set(key, arr)
  }
  for (const [, list] of seen) {
    if (list.length < 2) continue
    list.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0))
    const lo = Number(list[0].price ?? 0)
    const hi = Number(list[list.length - 1].price ?? 0)
    if (lo <= 0) continue
    if (hi - lo > lo * 0.05) continue // ±5% tolerance
    const focus = list[list.length - 1]
    return {
      id: `duplicate-${focus.id}`,
      emoji: '🪞',
      cat: 'Posible duplicado',
      title: `${list.length} cargos parecidos en 48h`,
      body: `Detecté ${list.length} cargos de "${focus.description}" por ~${fmt(hi)} en menos de 48h. ¿Confirmas que son distintos?`,
      impact: `Revisar: ${fmt(hi)}`,
      impactRaw: Math.round(hi),
      impactScope: 'oneTime',
      cta: 'Revisar',
      urgency: 'baja',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Dos cargos con descripción y monto casi idénticos en pocas horas suelen ser un duplicado del comercio o del registro manual. La idea es que el usuario lo confirme.',
      action: {
        kind: 'open-expenses-filtered',
        filter: { focusExpenseId: focus.id },
      },
    }
  }
  return null
}

/** No expenses logged in the last N days — surface a low-friction nudge. */
function buildDataGapWarning(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.expenses.length === 0) return null
  // Sorted by `created_at desc` upstream; first item is the most recent.
  const last = args.expenses[0]
  const lastTs = new Date(last.created_at).getTime()
  const now = (args.now ?? new Date()).getTime()
  const daysSince = Math.floor((now - lastTs) / DAY_MS)
  if (daysSince < 3) return null
  if (daysSince > 14) return null // beyond this we don't pester
  return {
    id: 'data-gap-warning',
    emoji: '📭',
    cat: 'Registros',
    title: `${daysSince} días sin gastos cargados`,
    body: `Si tuviste movimientos esos días, regístralos para que el cierre del mes refleje la realidad. Si no, ignora este aviso.`,
    impact: `Hace ${daysSince} días`,
    impactRaw: 0,
    impactScope: 'oneTime',
    cta: 'Cargar gastos',
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los signals dependen de que los gastos estén cargados. Una pausa larga sin registros suele indicar que algo no se anotó, no que no se gastó.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/expenses' },
  }
}

/** Goal hit 100% — positive reinforcement that doubles as a CTA to extend. */
function buildSavingsMilestone(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  if (goal.currentAmount < goal.goalAmount) return null
  return {
    id: 'savings-milestone',
    emoji: '🎯',
    cat: goal.title,
    title: `¡Llegaste a la meta!`,
    body: `Cumpliste el 100% de "${goal.title}" con ${fmt(goal.currentAmount)} ahorrados. Buen momento para definir la siguiente.`,
    impact: `Total: ${fmt(goal.goalAmount)}`,
    impactRaw: Math.round(goal.goalAmount),
    impactScope: 'oneTime',
    cta: 'Ver meta',
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Un hito sirve para celebrar y para aprovechar el envión: la siguiente meta arranca con el hábito ya construido, no desde cero.',
    action: { kind: 'open-savings-goal' },
  }
}

/** Payday passed but salary not yet confirmed → ask the user to
 *  refresh the cycle balance or adjust the payday. Critical because
 *  the rest of the engine assumes a confirmed cycle anchor. */
function buildIncomeMissing(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (!args.paydayPending) return null
  return {
    id: 'income-missing',
    emoji: '📭',
    cat: 'Cobro',
    title: 'Cobro esperado no confirmado',
    body: `Tu cobro estaba previsto pero el ciclo no se confirmó. Si llegó, actualiza el balance del nuevo ciclo. Si cambió la fecha, ajusta tu día de pago.`,
    // El "cobro esperado" es el SUELDO recurrente, no el ingreso del
    // ciclo: los income_events one-time (transferencias, sobrantes) ya
    // llegaron y no son lo que se está esperando. Sin esta distinción la
    // señal mostraba sueldo+extras (ej. 8.7M en vez de 6.4M).
    impact:
      (args.ingresoRecurrente ?? args.ingresoMes) > 0
        ? `Ingreso esperado: ${fmt(args.ingresoRecurrente ?? args.ingresoMes)}`
        : 'Confirmar cobro',
    impactRaw: Math.round(args.ingresoRecurrente ?? args.ingresoMes),
    impactScope: 'oneTime',
    cta: 'Actualizar',
    urgency: 'alta',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando el día de pago configurado ya pasó pero el mes no se confirmó, el resto del cálculo (lo que puedes gastar hoy) trabaja con el mes anterior. Confirmar aquí restablece la base.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' },
  }
}

/** First 1-2 days of cycle: structural libreRatio < 25% means tight month ahead. */
function buildCycleStartProjection(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const closedDays = args.view.detalleDias.length
  if (closedDays > 2) return null
  if (args.ingresoMes <= 0) return null
  const monthlyGoalNeed =
    args.savingsGoal && args.savingsGoal.isActive && args.savingsGoal.targetMonths
      ? Math.max(
          0,
          (args.savingsGoal.goalAmount - args.savingsGoal.currentAmount) /
            args.savingsGoal.targetMonths,
        )
      : 0
  const libre = args.ingresoMes - args.fijosMes - monthlyGoalNeed
  if (libre <= 0) return null
  const libreRatio = libre / args.ingresoMes
  if (libreRatio >= 0.25) return null
  const target = Math.round(args.ingresoMes * 0.25)
  const gap = Math.max(0, target - libre)
  return {
    id: 'cycle-start-projection',
    emoji: '🪶',
    cat: 'Inicio de ciclo',
    title: `Mes apretado: ${Math.round(libreRatio * 100)}% libre`,
    body: `Después de fijos${monthlyGoalNeed > 0 ? ' y meta' : ''}, te queda ${fmt(libre)} libre (${Math.round(libreRatio * 100)}% del ingreso). Cuando es bajo, cualquier imprevisto te deja sin recursos. Pausar la meta este mes o renegociar un fijo te da respiro.`,
    impact: `Aire faltante: ${fmt(gap)}`,
    impactRaw: gap,
    impactScope: 'monthly',
    cta: 'Ver fijos',
    urgency: 'media',
    confidence: 1.0,
    dataDays: closedDays,
    dummyExplanation:
      '"Libre" es lo que te queda del ingreso después de pagar fijos y separar la meta de ahorro. Si arranca bajo, cualquier imprevisto te deja sin recursos. Mejor avisarlo al inicio del mes cuando todavía hay tiempo para ajustar.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' },
  }
}

// ─── Group 10 — Forecast (P1) ───────────────────────────────────────
//
// forecast-payday-gap consume el `args.forecast` opcional (los otros 2
// pronósticos se descartaron en la curación 2026-06-15 por abstractos).
// Devuelve null si no hay forecast — degrada elegante en cold starts.

/** Proyección pesimista llega a $0 antes del cobro → aviso de supervivencia. */
function buildForecastPaydayGap(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const f = args.forecast
  if (!f) return null
  if (args.diasRestantes <= 1) return null
  if (f.pessimistic.dailyAvg <= 0) return null
  const remaining = args.view.restanteMes
  if (f.pessimistic.totalProjected <= remaining) return null
  const daysToZero = Math.floor(remaining / f.pessimistic.dailyAvg)
  if (daysToZero >= args.diasRestantes) return null
  const gapDays = args.diasRestantes - daysToZero
  if (gapDays <= 0) return null
  const gapAmount = Math.round(f.pessimistic.dailyAvg * gapDays)
  return {
    id: 'forecast-payday-gap',
    emoji: '⏳',
    cat: 'Predicción',
    title: `Riesgo: $0 ${gapDays} día${gapDays === 1 ? '' : 's'} antes del cobro`,
    body: `Si gastas como los últimos días, llegas a $0 unos ${gapDays} ${gapDays === 1 ? 'día' : 'días'} antes del próximo cobro. Hay tiempo para corregir si recortas ahora.`,
    impact: `Faltan ${fmt(gapAmount)}`,
    impactRaw: gapAmount,
    impactScope: 'oneTime',
    cta: 'Ajustar plan',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Comparamos lo que te queda con lo que podrías llegar a gastar en el peor de los casos (días caros + fijos). Si la cuenta da menos que los días que faltan para el cobro, se prende esta alerta.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' },
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
    title: `${racha} días seguidos sin pasarte`,
    body: `Vas controlado. A este paso, el cierre del mes deja ${fmt(
      Math.max(0, args.view.sobrantePresupuestadoMes),
    )} sin gastar.`,
    impact: `Lo que puedes gastar hoy: ${fmt(args.cupoDiario)}`,
    impactRaw: 0,
    cta: 'Entendido',
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuenta días seguidos en los que el gasto del día se mantuvo bajo control. Ver los días seguidos refuerza el hábito y hace visible el progreso del mes.',
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
      return 'Cierre por encima del presupuesto'
    case 'warn':
      return 'Ritmo por encima del objetivo'
    case 'watch':
      return 'Ritmo elevado'
    default:
      return 'Ritmo estable'
  }
}

export type { DayDetail, DowBucket }
