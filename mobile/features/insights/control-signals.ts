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
import type { CausalLink } from '@/features/insights/causal-engine'
import type { UserPersona } from '@/features/insights/persona'
import { framingFor } from '@/features/insights/persona'
import { signalFamilyOf } from '@/features/insights/signal-family'
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
  /** Causal links detected by `detectCausalLinks()` (P3). Builders
   *  for the `causal-*` family consume them. */
  causalLinks?: CausalLink[]
  /** Persisted per-device dismiss map keyed by fixed_expense_id →
   *  price-at-dismissal. */
  dismissedHikes?: Record<string, number>
  /** Per-user calibration baselines. When ≥3 cycles closed, this
   *  replaces hardcoded thresholds (e.g. cat-dominance 40%) with
   *  the user's own P75 — what's "normal" for them. */
  baselines?: UserBaselines
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

  // Group 9 — Atomic awareness (P1)
  pushIfDefined(signals, buildHighSingleExpense(args))
  pushIfDefined(signals, buildDuplicateMerchant(args))
  pushIfDefined(signals, buildDataGapWarning(args))
  pushIfDefined(signals, buildSavingsMilestone(args))
  pushIfDefined(signals, buildCycleStartProjection(args))
  pushIfDefined(signals, buildIncomeMissing(args))

  // Group 10 — Forecast (P1)
  pushIfDefined(signals, buildForecastTomorrowRisk(args))
  pushIfDefined(signals, buildForecastStormWeek(args))
  pushIfDefined(signals, buildForecastPaydayGap(args))

  // Group 11 — Causal patterns (P3)
  pushIfDefined(signals, buildCausalFridayCascade(args))
  pushIfDefined(signals, buildCausalPairedImpulse(args))
  pushIfDefined(signals, buildCausalStressSpending(args))

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
  return applyDiversityBudget(ranked).slice(0, 5)
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
    // start-splurge title is "${pct}% del mes gastado en los primeros 3 días" —
    // pull the percentage out by regex so the merged copy carries the
    // real number (the previous `split(': ')` always missed and fell
    // back to a generic phrase).
    const pctMatch = startSplurge.title.match(/(\d+%)/)
    const pctText = pctMatch ? `${pctMatch[1]} del mes en los primeros días` : 'porcentaje alto en los primeros días'
    const merged: ControlAdvisorTask = {
      ...velocity,
      body: `Arranque elevado (${pctText}). ${velocity.body}`,
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
      // Pull the % straight from the dominance title (always shaped
      // like "<cat>: NN% del gasto…"). If the parse fails, drop the
      // share-sentence rather than silently invent "40%" — lying with
      // a fake number was the original bug.
      const sharePct = dominance.title.match(/(\d+)%/)?.[1]
      const sharePhrase = sharePct
        ? ` Además, ya concentra el ${sharePct}% del gasto del mes — punto de apalancamiento alto.`
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

function findFirst(
  byId: Map<string, ControlAdvisorTask>,
  predicate: (id: string, t: ControlAdvisorTask) => boolean,
): { id: string; task: ControlAdvisorTask } | null {
  for (const [id, task] of byId) {
    if (predicate(id, task)) return { id, task }
  }
  return null
}

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
      'Cuando los fijos pesan demasiado y al mismo tiempo hay sobregiro o aceleración, no es un problema aislado: es la suma. El plan integral baja a la vez la presión estructural y el día a día.',
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
    cat: 'Momentum',
    title: 'Momentum positivo',
    body: `Llevas racha sostenida, el ciclo proyecta sobrante, y hay categorías a favor. Es el momento de capitalizar: subir la meta o reasignar el excedente.`,
    impact: headline.label,
    impactRaw: headline.impactRaw,
    impactScope: headline.impactScope,
    cta: 'Capitalizar',
    urgency: 'baja',
    confidence: Math.min(streak.confidence, positive.confidence, reinforcer.confidence),
    dataDays: Math.max(streak.dataDays, positive.dataDays, reinforcer.dataDays),
    dummyExplanation:
      'La combinación de tres señales positivas a la vez — racha, sobrante y win por categoría — sostiene un cambio real. Buen momento para subir la meta o destinar el excedente.',
    composedOf,
    action: { kind: 'open-savings-goal' },
  }
}

function tryComposeHiddenDrain(
  byId: Map<string, ControlAdvisorTask>,
): ControlAdvisorTask | null {
  const leaks = byId.get('small-leaks')
  const dominance = findFirst(byId, (id) => id.startsWith('cat-dominance-'))
  const undetectedSub = findFirst(byId, (id) => id.startsWith('undetected-sub-'))
  // Need ≥2 of the three.
  const present = [leaks, dominance?.task, undetectedSub?.task].filter(
    (t): t is ControlAdvisorTask => Boolean(t),
  )
  if (present.length < 2) return null
  const composedOf = present.map((t) => t.id)
  if (leaks) byId.delete(leaks.id)
  if (dominance) byId.delete(dominance.id)
  if (undetectedSub) byId.delete(undetectedSub.id)
  const annualizedSum = present.reduce((sum, t) => sum + t.impactRaw * 12, 0)
  return {
    id: 'super-hidden-drain',
    emoji: '💧',
    cat: 'Drenaje',
    title: 'Drenaje invisible',
    body: 'Filtraciones chicas, una categoría dominante y/o un monto repetido sin registrar como fijo. Tres señales que en conjunto suelen explicar el goteo del mes.',
    impact: `Goteo anual estimado: ${fmt(annualizedSum)}`,
    impactRaw: Math.round(annualizedSum),
    impactScope: 'oneTime',
    cta: 'Auditar',
    urgency: 'media',
    confidence: Math.min(...present.map((t) => t.confidence)),
    dataDays: Math.max(...present.map((t) => t.dataDays)),
    dummyExplanation:
      'Cuando varios patrones de gasto chico coinciden, el problema no está en una compra — está en la dinámica. Una auditoría guiada ayuda a ver qué cancelar, qué reasignar y qué dejar pasar.',
    composedOf,
    action: { kind: 'open-coach-mode', signalId: 'super-hidden-drain', topic: 'leaks' },
  }
}

function composeSuperSignals(
  tasks: ControlAdvisorTask[],
): ControlAdvisorTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const supers: ControlAdvisorTask[] = []
  // Order matters: critical confluence first, then positive momentum,
  // finally hidden drain (which competes for `small-leaks` etc.).
  const storm = tryComposePerfectStorm(byId)
  if (storm) supers.push(storm)
  const momentum = tryComposeSavingsMomentum(byId)
  if (momentum) supers.push(momentum)
  const drain = tryComposeHiddenDrain(byId)
  if (drain) supers.push(drain)
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
      'Un "fijo" es un pago mensual recurrente (alquiler, servicios, suscripciones). Cuando varios caen en la misma semana, hay menos margen disponible para gasto variable. Avisamos con anticipación para evitar sorpresas.',
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
    title: `Quedan ${args.diasRestantes} días con ${fmt(remaining)} disponibles`,
    body: `Para llegar al próximo cobro sin quedar en cero, el tope diario sugerido es ${fmt(sustainable)} (antes ${fmt(args.cupoDiario)}).`,
    impact: `Nuevo tope diario: ${fmt(sustainable)}`,
    impactRaw: Math.round((args.cupoDiario - sustainable) * args.diasRestantes),
    impactScope: 'cycle',
    cta: 'Entendido',
    urgency: sustainable < args.cupoDiario * 0.5 ? 'alta' : 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Divide el saldo restante del mes por los días que faltan al próximo cobro. El resultado es el monto máximo a gastar por día para no quedar en cero antes del cierre.',
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
    title: `${Math.round(pct)}% del mes gastado en los primeros 3 días`,
    body: `Los primeros 3 días representan ${fmt(spent)}, equivalente a más de ${Math.round(pct / 3.3)} días de cupo. Si el ritmo se mantiene, el resto del mes queda ajustado.`,
    // The $X is the 3-day OVERAGE the user already spent vs the daily
    // cap × 3 days — it's a one-time recovery target, NOT a recurring
    // monthly amount. Earlier copy said "+$X/mes" which conflated the
    // two and inflated perceived severity. Now the label is honest
    // about what the number represents.
    impact: `Recuperar: +${fmt(spent - args.cupoDiario * 3)}`,
    impactRaw: Math.max(0, Math.round(spent - args.cupoDiario * 3)),
    impactScope: 'oneTime',
    cta: 'Entendido',
    urgency: 'media',
    confidence: 0.9,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Es normal gastar con menos restricción los días después del cobro, cuando hay saldo fresco. Si los primeros 3 días se llevan una porción grande del presupuesto, el resto del mes queda ajustado.',
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
    title: `Aceleración del ${Math.round((ratio - 1) * 100)}% en los últimos 3 días`,
    body: `Promedio reciente: ${fmt(last3Avg)}/día vs ${fmt(cycleAvg)} del mes. Quedan ${args.diasRestantes} días — al ritmo actual, el cierre se va por encima del presupuesto.`,
    impact: `Volver al promedio: ${fmtDelta(-extra)}`,
    impactRaw: Math.round(extra),
    impactScope: 'cycle',
    cta: 'Entendido',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Es común relajar el control al final del mes, justo cuando una aceleración golpea más al cierre. Comparar los últimos 3 días contra el promedio del mes ayuda a detectar el cambio a tiempo.',
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
      title: 'Sobregiro fuerte hoy',
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
        'Cuando el sobregiro del día es grande, intentar bajar mucho el cupo el resto del mes no funciona. Mejor reajustar la meta de ahorro o reordenar algún gasto fijo antes que sostener un objetivo imposible.',
      action: { kind: 'open-settings-modal', modal: 'savings-percent' },
    }
  }
  return {
    id: 'recovery-soft',
    emoji: '🧭',
    cat: 'Recuperación',
    title: 'Cupo diario reajustado',
    body: `Sobregiro del día: ${fmt(overspend)}. Si se mantiene ${fmt(newCupo)}/día hasta fin de mes, el ciclo cierra sin problemas.`,
    impact: `Nuevo cupo: ${fmt(newCupo)}/día`,
    impactRaw: Math.round(overspend),
    impactScope: 'oneTime',
    cta: 'Entendido',
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando el sobregiro es moderado, se reparte entre los días que quedan y queda un cupo un poco más bajo. Si se mantiene ese cupo, el ciclo cierra dentro del presupuesto.',
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
    impact: over > 0 ? `Frenar: ${fmtDelta(-over)}` : 'Mantener ritmo',
    impactRaw: Math.max(0, Math.round(over)),
    impactScope: 'oneTime',
    cta: 'Entendido',
    urgency,
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara la velocidad de gasto reciente (últimos 7 días) contra el promedio del mes. Si la velocidad se aceleró, proyecta el monto estimado de cierre para anticipar el resultado del mes.',
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
    cat: 'Proyección',
    title: `Excedente proyectado: ${fmt(sobra)}`,
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
      'Proyecta el cierre del mes combinando el ritmo de gasto actual con los días restantes. Cuando el resultado es positivo, anticipa el monto excedente disponible para meta de ahorro o reserva.',
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
    ? `Llevas ${fmt(topNow.amount)} este mes vs ${fmt(historicalAvg)} habitual. Casi todo es de los últimos 7 días — probablemente un gasto único (viaje, regalo, compra grande). Si se repite, el próximo mes va a ser ajustado.`
    : `Llevas ${fmt(topNow.amount)} este mes vs ${fmt(historicalAvg)} habitual. La suba es gradual, parece un cambio de hábito.`
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
      'Compara el gasto actual en una categoría contra su promedio histórico. Una suba marcada puede ser puntual (un evento único) o el inicio de un cambio de hábito. Detectarla a tiempo ayuda a ajustar antes de que afecte el cierre.',
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
        ? `${name}: tope superado`
        : `${name} al ${pct}% del tope`,
      body: breach
        ? `Tu tope era ${fmt(limit.monthly_cap)} y llevas gastados ${fmt(spent)}. Sobregiro: ${fmt(spent - limit.monthly_cap)}.`
        : `Llevas ${fmt(spent)} de los ${fmt(limit.monthly_cap)} que pusiste como tope. Quedan ${fmt(limit.monthly_cap - spent)} para cerrar el mes.`,
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
    body: `De los ${fmt(total)} que gastaste este mes, ${fmt(top.amount)} fueron en ${top.name}. Si gastás un poco menos ahí, se nota más que recortar en varias categorías chicas.`,
    impact: `Reducir 10%: +${fmt(save10)}/mes`,
    impactRaw: Math.round(save10),
    cta: 'Entendido',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando una categoría concentra el 40% o más del gasto, ahí está la mayor palanca para ahorrar. Una reducción chica en la categoría dominante rinde más que varios ajustes menores.',
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
      'Las compras nocturnas (delivery, apps) suelen ser más impulsivas — varios estudios lo muestran. Esperar al día siguiente para decidir suele cortar la mitad de esas compras.',
    action: { kind: 'dismiss', dismissId: 'night-impulse' },
  }
}

/** Same amount repeating on different days, NOT already a fijo. */
function buildUndetectedSubscription(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  if (discretionary.length < 4) return null
  // Group by *relative* tolerance (±5%) instead of fixed-width buckets.
  // Fixed $50 buckets miss obvious matches like $900 vs $950 (5% apart
  // but split across buckets) and miss anything below the old $1000
  // floor (Spotify/Apple Music sit at $700-$900). We anchor each
  // bucket on the first matching price and accept anything within
  // ±5% — looser than 50/100 grouping at low magnitudes, tighter at
  // high ones, which matches how subscription pricing actually works.
  interface Bucket {
    anchor: number
    entries: Array<{ amount: number; day: number; desc: string }>
  }
  const buckets: Bucket[] = []
  for (const e of discretionary) {
    const amount = Number(e.price ?? 0)
    if (amount < 500) continue
    const day = new Date(e.created_at).getDate()
    const desc = e.description ?? ''
    const bucket = buckets.find(
      (b) => Math.abs(amount - b.anchor) / b.anchor <= 0.05,
    )
    if (bucket) {
      bucket.entries.push({ amount, day, desc })
    } else {
      buckets.push({ anchor: amount, entries: [{ amount, day, desc }] })
    }
  }
  // Look for a bucket that fires ≥2 times on different days. Use the
  // bucket's median amount as the canonical price so a slightly noisy
  // run (e.g. $895 + $905 + $900) reports the typical value, not a
  // tail observation.
  for (const { entries } of buckets) {
    if (entries.length < 2) continue
    const uniqueDays = new Set(entries.map((e) => e.day)).size
    if (uniqueDays < 2) continue
    const sorted = [...entries].sort((a, b) => a.amount - b.amount)
    const median = sorted[Math.floor(sorted.length / 2)]!.amount
    const amount = Math.round(median)
    const desc = entries.find((e) => e.desc)?.desc ?? ''
    return {
      id: `undetected-sub-${amount}`,
      emoji: '🔁',
      cat: 'Suscripciones',
      title: `Posible suscripción no registrada: ${fmt(amount)}`,
      body: `Encontramos ${entries.length} gastos por un monto similar${desc ? ` ("${desc.slice(0, 40)}")` : ''}. Si se repite todos los meses, mejor registrarlo como gasto fijo para hacer seguimiento.`,
      impact: `Mejor seguimiento mensual`,
      // Monthly magnitude (ranking convention: every signal's
      // impactRaw is in MONTHLY equivalent so the score formula
      // `urgencyWeight × impactRaw × confidence` compares apples to
      // apples). The annual context lives in the body ("Si se repite
      // todos los meses…"), not in the rank-driving number.
      impactRaw: Math.round(amount),
      cta: 'Registrar',
      urgency: 'baja',
      confidence: rampThreeWeeks(args.view.detalleDias.length),
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Detecta montos que se repiten en días distintos — patrón típico de suscripciones cargadas como gasto variable. Si las registras como gasto fijo, puedes seguir aumentos y detectar las que dejas de usar.',
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
      title: `Los ${dowName} gastás más`,
      body: `Los ${dowName} gastás bastante más que un día normal. En todo el mes, eso suma ${fmt(dowExtra)} de más.`,
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
    title: `Los findes gastás más`,
    body: `De lunes a viernes gastás ${fmt(wkdayAvgValue)} por día. Sábados y domingos, ${fmt(weekendAvgValue)} por día. Ahí es donde más podés recortar.`,
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
    impact: `Bajando alguno: liberás ${fmt(excess)}/mes`,
    impactRaw: Math.round(excess),
    cta: 'Ver fijos',
    urgency: severity,
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'La regla común dice que los gastos fijos no deberían pasar el 50% del ingreso. Por encima de ese límite, queda poco margen para imprevistos y ahorro.',
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
      ? `Ingreso +${pct.toFixed(0)}% vs promedio histórico`
      : `Ingreso −${Math.abs(pct).toFixed(0)}% vs promedio histórico`,
    body: better
      ? `Tu ingreso pasó de ${fmt(historicalAvg)} a ${fmt(args.ingresoMes)}. El presupuesto libre creció — buen momento para subir el ahorro mensual.`
      : `Tu ingreso pasó de ${fmt(historicalAvg)} a ${fmt(args.ingresoMes)}. Los fijos pesan más en proporción — momento de revisarlos.`,
    impact: fmtDelta(delta),
    impactRaw: Math.abs(Math.round(delta)),
    cta: better ? 'Ver meta' : 'Ver fijos',
    urgency: better ? 'baja' : 'media',
    confidence: rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara el ingreso del mes contra el promedio de los últimos 3 meses. Una variación significativa cambia el peso relativo de los gastos fijos y la capacidad de ahorro disponible.',
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
      // Auditoría 2026-06-11: la heurística server pasó a payment-aware
      // (un fijo PAGADO hace <60 días no es zombie) — el copy ahora dice
      // exactamente lo que detectamos: sin pagos NI uso registrado.
      title: `${name}: sin movimiento hace 2+ meses`,
      body: `No registrás pagos de ${name} hace 60+ días. Cuesta ${fmt(amount)}/mes en tu presupuesto: si ya no lo usás, cancelalo y recuperás ${fmt(amount * 12)} al año.`,
      impact: `+${fmt(amount)}/mes`,
      impactRaw: Math.round(amount),
      cta: 'Revisar',
      urgency: 'alta',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation:
        'Un compromiso "zombi" es un servicio que sigue en tu presupuesto pero no muestra movimiento: hace más de 2 meses que no registrás un pago. Puede que lo hayas cancelado (sacalo de tus fijos) o que lo hayas olvidado (decidí si lo querés mantener).',
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
    title: `Meta "${goal.title}": faltan ${fmt(shortfall)} este mes`,
    body: `El plan necesita ${fmt(monthlyNeeded)}/mes para llegar al objetivo. Este mes vas por ${fmt(monthlyActual)}. Si no se recupera la diferencia, la fecha se aleja.`,
    impact: `Cubrir ${fmt(shortfall)} este mes`,
    impactRaw: Math.round(shortfall),
    cta: 'Ver meta',
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Compara el ahorro mensual actual contra el monto que pide el plan. Detectar el desvío en los primeros meses ayuda a ajustar antes de que se extienda mucho el plazo.',
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
    title: `Distribución desbalanceada: ${Math.round(pct)}% en un miembro`,
    body: `Del total de ${fmt(total)} gastado este mes, ${fmt(topAmount)} los puso una sola persona. Vale la pena revisar si el reparto refleja el acuerdo del hogar.`,
    impact: `Reparto equitativo: ${fmt(total / 2)} cada uno`,
    impactRaw: 0,
    cta: 'Avisar',
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'En hogares compartidos, la distribución del gasto suele desviarse del acuerdo sin que nadie lo note. Mostrar el reparto real ayuda a hablarlo entre todos.',
    action: {
      kind: 'send-member-warning',
      targetUserId: topId,
      message: `Aviso del asistente: este mes concentraste el ${Math.round(pct)}% del gasto del hogar (${fmt(topAmount)} de ${fmt(total)}).`,
    },
  }
}

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
    body: `Hoy registraste ${fmt(price)} en un solo movimiento — ${pct}% del cupo diario (${fmt(args.cupoDiario)}). Mira si conviene compensar el resto del día.`,
    impact: `Hoy: ${fmt(price)}`,
    impactRaw: Math.round(price),
    impactScope: 'oneTime',
    cta: 'Ver detalle',
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando un solo gasto ocupa una porción grande del cupo del día, el resto del día queda sin margen. Verlo apenas pasa permite reaccionar.',
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
    (e) => new Date(e.created_at).getTime() >= cutoff,
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
    body: `Si tuviste movimientos esos días, registralos para que el cierre del mes refleje la realidad. Si no, ignorá este aviso.`,
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
      'Un hito sirve para celebrar y para reusar el momentum: la siguiente meta arranca con el hábito ya construido, no desde cero.',
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
    impact: args.ingresoMes > 0 ? `Ingreso esperado: ${fmt(args.ingresoMes)}` : 'Confirmar cobro',
    impactRaw: Math.round(args.ingresoMes),
    impactScope: 'oneTime',
    cta: 'Actualizar',
    urgency: 'alta',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando el día de pago configurado ya pasó pero el ciclo no se confirmó, el resto del cálculo (cupo diario, proyecciones) trabaja con el ciclo anterior. Confirmar aquí restablece la base.',
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
    body: `Después de fijos${monthlyGoalNeed > 0 ? ' y meta' : ''}, te queda ${fmt(libre)} libre (${Math.round(libreRatio * 100)}% del ingreso). Lo saludable es ≥25%. Pausar la meta este mes o renegociar un fijo te da aire.`,
    impact: `Aire faltante: ${fmt(gap)}`,
    impactRaw: gap,
    impactScope: 'monthly',
    cta: 'Ver fijos',
    urgency: 'media',
    confidence: 1.0,
    dataDays: closedDays,
    dummyExplanation:
      '"Libre" es lo que te queda del ingreso después de pagar fijos y separar la meta de ahorro. Si arranca bajo, cualquier imprevisto pega más fuerte. Mejor avisarlo al inicio del mes cuando todavía hay margen para ajustar.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' },
  }
}

// ─── Group 10 — Forecast (P1) ───────────────────────────────────────
//
// The three predictive signals consume the optional `args.forecast`
// snapshot. They return null when the forecast is absent or doesn't
// carry the data the rule needs — the system degrades gracefully on
// older deploys / cold starts.

const PROJECT_DOW_FROM_NAME: Record<string, number> = {
  Lun: 0,
  Mar: 1,
  Mié: 2,
  Jue: 3,
  Vie: 4,
  Sáb: 5,
  Dom: 6,
}

/** Tomorrow falls on the user's worst-historical DoW with a thin margin. */
function buildForecastTomorrowRisk(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const peor = args.view.peorDow
  if (!peor || peor.count < 2) return null
  const peorDowIdx = PROJECT_DOW_FROM_NAME[peor.name]
  if (peorDowIdx == null) return null
  const now = args.now ?? new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowDow = (tomorrow.getDay() + 6) % 7
  if (tomorrowDow !== peorDowIdx) return null
  const remaining = args.view.restanteMes
  const expected = peor.avg
  if (expected <= 0) return null
  if (remaining > expected * 1.5) return null
  const buffer = Math.max(0, remaining - expected)
  return {
    id: 'forecast-tomorrow-risk',
    emoji: '📅',
    cat: 'Predicción',
    title: `Mañana suele ser tu peor día`,
    body: `Mañana es ${peor.name.toLowerCase()}, históricamente promediás ${fmt(expected)}. Hoy te queda ${fmt(remaining)} libre — gastá menos de ${fmt(buffer)} para no arrancar mañana en rojo.`,
    impact: `Margen mañana: ${fmt(buffer)}`,
    impactRaw: Math.round(expected),
    impactScope: 'oneTime',
    cta: 'Ver semana',
    urgency: 'media',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'El sistema mira tus gastos por día de la semana y detecta cuál suele ser el más caro. Si mañana es ese día, conviene cerrar hoy con margen.',
    action: { kind: 'scroll-to-section', section: 'semana' },
  }
}

/** Three or more DISTINCT inflection days in next 7 → "storm week". */
function buildForecastStormWeek(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const f = args.forecast
  if (!f) return null
  // Count distinct dates so a single date that triggers both
  // `fixed_payment` and `historical_high_dow` doesn't double-count
  // toward the threshold. We keep the highest expectedAmount per day
  // for the impact total.
  const byDay = new Map<string, number>()
  for (const ev of f.inflectionDays) {
    const prev = byDay.get(ev.day) ?? 0
    if (ev.expectedAmount > prev) byDay.set(ev.day, ev.expectedAmount)
  }
  const distinctDays = byDay.size
  if (distinctDays < 3) return null
  // Sum only the top 5 distinct-day amounts to keep the impact bounded.
  const sorted = Array.from(byDay.values()).sort((a, b) => b - a)
  const totalImpact = sorted.slice(0, 5).reduce((s, v) => s + v, 0)
  if (totalImpact <= 0) return null
  return {
    id: 'forecast-storm-week',
    emoji: '🌩️',
    cat: 'Predicción',
    title: `Semana cargada: ${distinctDays} días`,
    body: `Próximos 7 días: ${distinctDays} días con cargos importantes (${fmt(totalImpact)} en total). Reservá margen antes de que lleguen.`,
    impact: `A reservar: ${fmt(totalImpact)}`,
    impactRaw: Math.round(totalImpact),
    impactScope: 'oneTime',
    cta: 'Ver semana',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando se acumulan vencimientos de fijos, días caros y caps cerca, conviene reservar el monto antes que reaccionar después. El forecast detecta ese cluster.',
    action: { kind: 'scroll-to-section', section: 'semana' },
  }
}

/** Pessimistic track exhausts `restanteMes` before payday → recovery urgent. */
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
    body: `Si sigues al ritmo proyectado de los últimos días, llegas a $0 unos ${gapDays} ${gapDays === 1 ? 'día' : 'días'} antes del próximo cobro. Hay margen para corregir si recortás ahora.`,
    impact: `Faltan ${fmt(gapAmount)}`,
    impactRaw: gapAmount,
    impactScope: 'oneTime',
    cta: 'Ajustar plan',
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Comparamos lo que te queda con lo que proyectamos en el peor escenario (días caros + fijos). Si la cuenta da menos que los días que faltan al cobro, se prende esta alerta.',
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' },
  }
}

// ─── Group 11 — Causal patterns (P3) ────────────────────────────────
//
// Each builder consumes a single `CausalLink` from `detectCausalLinks`
// and converts it into an INSIGHT card. We require a minimum
// `confidence` of 0.4 (same as the global floor) so brand-new patterns
// stay invisible until they stabilize.

function buildCausalFridayCascade(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const links = args.causalLinks
  if (!links || links.length === 0) return null
  const link = links.find(
    (l) =>
      l.cause.type === 'day' &&
      l.cause.value === 'friday' &&
      l.effect.type === 'spending_spike',
  )
  if (!link) return null
  if (link.confidence < 0.4) return null
  // Only nudge on Thursday — by then the user can still adjust before
  // the cascade kicks in.
  const now = args.now ?? new Date()
  const projectDow = (now.getDay() + 6) % 7
  if (projectDow !== 3) return null
  const pct = Math.round(link.effect.magnitude * 100)
  return {
    id: 'causal-friday-cascade',
    emoji: '🪢',
    cat: 'Patrón causal',
    title: 'Patrón viernes → sábado',
    body: `Detecté ${link.occurrences} veces que un viernes con gasto alto dispara un sábado ${pct}% más caro de lo habitual. Hoy es jueves: si mañana hay salida, atención el sábado.`,
    impact: `+${pct}% en sábados gatillados`,
    impactRaw: Math.round(link.effect.magnitude * 5000),
    impactScope: 'monthly',
    cta: 'Entendido',
    urgency: 'baja',
    confidence: link.confidence,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuando dos días seguidos suelen "encadenarse" (un día caro dispara el siguiente), avisarlo el día anterior te da margen para frenar el rebote sin esfuerzo.',
    action: { kind: 'dismiss', dismissId: 'causal-friday-cascade' },
  }
}

function buildCausalPairedImpulse(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const links = args.causalLinks
  if (!links || links.length === 0) return null
  const link = links.find(
    (l) => l.cause.type === 'category' && l.effect.type === 'spending_spike',
  )
  if (!link) return null
  if (link.confidence < 0.4) return null
  const cat = args.categoriesExpense.find((c) => c.id === link.cause.value)
  const catName = cat?.name ?? 'esa categoría'
  const pct = Math.round(link.effect.magnitude * 100)
  return {
    id: `causal-paired-${link.cause.value}`,
    emoji: '🪞',
    cat: catName,
    title: 'Compras pareadas',
    body: `Cuando compras en ${catName}, el ${pct}% de las veces hay otro gasto similar en menos de 3 horas. Si te pasa hoy, espera 24h antes del segundo.`,
    impact: 'Pausa de 24h sugerida',
    impactRaw: Math.round(link.effect.magnitude * 8000),
    impactScope: 'monthly',
    cta: 'Entendido',
    urgency: 'baja',
    confidence: link.confidence,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Las compras pareadas suelen ser impulsos seguidos (algo + el "vamos a aprovechar"). Detectamos el patrón cuando se repite y sugerimos romperlo con una pausa explícita.',
    action: {
      kind: 'dismiss',
      dismissId: `causal-paired-${link.cause.value}`,
    },
  }
}

function buildCausalStressSpending(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const links = args.causalLinks
  if (!links || links.length === 0) return null
  const link = links.find(
    (l) =>
      l.cause.type === 'time' &&
      l.cause.value === 'multi-tx-day' &&
      l.effect.type === 'spending_spike',
  )
  if (!link) return null
  if (link.confidence < 0.4) return null
  const pct = Math.round(link.effect.magnitude * 100)
  return {
    id: 'causal-stress-spending',
    emoji: '🌪️',
    cat: 'Patrón causal',
    title: 'Días de muchas compras chicas',
    body: `Detecté ${link.occurrences} días con 4+ transacciones — esos días gastas ${pct}% más en promedio, casi todo discrecional. Prueba una pausa antes de la 5ª compra del día.`,
    impact: `+${pct}% en días de stress`,
    impactRaw: Math.round(link.effect.magnitude * 8000),
    impactScope: 'monthly',
    cta: 'Entendido',
    urgency: 'baja',
    confidence: link.confidence,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Los días con muchas transacciones chicas suelen ser días "altos" en discrecional. Avisar a partir de la cuarta tx del día corta el patrón antes que escale.',
    action: { kind: 'dismiss', dismissId: 'causal-stress-spending' },
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
    title: `Racha: ${racha} días bajo cupo`,
    body: `Ritmo sostenido en el ciclo. A este paso, el cierre del mes deja un excedente de ${fmt(
      Math.max(0, args.view.sobrantePresupuestadoMes),
    )}.`,
    impact: `Cupo del día: ${fmt(args.cupoDiario)}`,
    impactRaw: 0,
    cta: 'Entendido',
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      'Cuenta días seguidos en los que el gasto del día se mantuvo dentro del cupo. Ver la racha refuerza el hábito y hace visible el progreso del mes.',
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
