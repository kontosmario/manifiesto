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

import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import { weekdayLongFromMondayIndex } from '@/utils/date-format'
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
import { clampFinite, finiteOr, isFiniteNumber } from '@/features/insights/signal-guards'

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
   *  son el cobro que se está esperando. Fallback a `ingresoMes`.
   *  En modo DINÁMICO el hook lo setea a Σ income_events del ciclo (la
   *  única referencia de ingreso que existe sin sueldo). */
  ingresoRecurrente?: number
  /** Régimen de ingreso del hogar. 'dynamic' = sin sueldo fijo: cambia
   *  la referencia de `income-volatility` (histórico de extra_income),
   *  activa la rama dinámica de `income-missing` (sin payday) y el
   *  copy neutral de `fijos-ratio` (sin "sueldo"). */
  incomeMode?: 'fixed' | 'dynamic'
  /** Días TOTALES del ciclo de accounting (progreso del ciclo para la
   *  rama dinámica de `income-missing`). */
  diasCiclo?: number
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
    // Firewall numérico: una señal con confidence o impactRaw NO finito nunca
    // llega al usuario. Crítico: `NaN < MIN_CONFIDENCE` es `false`, así que la
    // comparación sola dejaba colar señales con confianza/impacto inválidos.
    if (!Number.isFinite(s.confidence) || !Number.isFinite(s.impactRaw)) return false
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
        ? i18n.t('insights:signals.catAccel.fuseShare', { pct: sharePct })
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
    cat: i18n.t('insights:signals.superStorm.cat'),
    title: i18n.t('insights:signals.superStorm.title'),
    body: i18n.t('insights:signals.superStorm.body', {
      context: present.length === 3 ? 'three' : 'two',
      factors: titleSummary,
    }),
    impact: i18n.t('insights:signals.superStorm.impact', {
      amount: fmt(Math.round(annualizedSum * 1.2)),
    }),
    impactRaw: Math.round(annualizedSum * 1.2),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.planIntegral'),
    urgency: 'alta',
    confidence: Math.min(...present.map((t) => t.confidence)),
    dataDays: Math.max(...present.map((t) => t.dataDays)),
    dummyExplanation: i18n.t('insights:signals.superStorm.explanation'),
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
    cat: i18n.t('insights:signals.superSavings.cat'),
    title: i18n.t('insights:signals.superSavings.title'),
    body: i18n.t('insights:signals.superSavings.body'),
    impact: headline.label,
    impactRaw: headline.impactRaw,
    impactScope: headline.impactScope,
    cta: i18n.t('insights:cta.capitalizar'),
    urgency: 'baja',
    confidence: Math.min(streak.confidence, positive.confidence, reinforcer.confidence),
    dataDays: Math.max(streak.dataDays, positive.dataDays, reinforcer.dataDays),
    dummyExplanation: i18n.t('insights:signals.superSavings.explanation'),
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
  // Sumar sólo montos finitos > 0 (un amount null/NaN no debe romper el total;
  // el valor de la señal es el CONTEO de fijos por vencer + los nombres).
  const total = due.reduce((s, f) => {
    const a = Number(f.amount ?? 0)
    return s + (isFiniteNumber(a) && a > 0 ? a : 0)
  }, 0)
  const names = due.slice(0, 3).map((f) => f.name).filter(Boolean).join(', ')
  return {
    id: 'stress-week',
    emoji: '📅',
    cat: i18n.t('insights:signals.stressWeek.cat'),
    title: i18n.t('insights:signals.stressWeek.title', { count: due.length }),
    body:
      due.length > 3
        ? i18n.t('insights:signals.stressWeek.bodyMore', {
            names,
            count: due.length - 3,
            total: fmt(total),
          })
        : i18n.t('insights:signals.stressWeek.body', { names, total: fmt(total) }),
    impact: i18n.t('insights:signals.stressWeek.impact', { total: fmt(total) }),
    impactRaw: total,
    impactScope: 'cycle',
    cta: i18n.t('insights:cta.verFijos'),
    urgency: 'alta',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.stressWeek.explanation'),
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
  // DINÁMICO: la matemática es idéntica (diasRestantes ya es del ciclo
  // elegido) pero el marco "cobro" no existe — copy de fin de ciclo.
  const keys =
    args.incomeMode === 'dynamic'
      ? 'insights:signals.paydayProximityDynamic'
      : 'insights:signals.paydayProximity'
  return {
    id: 'payday-proximity',
    emoji: '📆',
    cat: i18n.t(`${keys}.cat`),
    title: i18n.t(`${keys}.title`, {
      remaining: fmt(remaining),
      days: args.diasRestantes,
    }),
    body: i18n.t(`${keys}.body`, {
      perDay: fmt(sustainable),
    }),
    impact: i18n.t(`${keys}.impact`, {
      perDay: fmt(sustainable),
    }),
    impactRaw: Math.round((args.cupoDiario - sustainable) * args.diasRestantes),
    impactScope: 'cycle',
    bubbleFrame: args.incomeMode === 'dynamic' ? 'cycle' : 'payday',
    cta: i18n.t('insights:cta.entendido'),
    urgency: sustainable < args.cupoDiario * 0.5 ? 'alta' : 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t(`${keys}.explanation`),
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
  // Validez: los 3 días deben tener gasto finito (un null/NaN por gap de data
  // contaminaría el promedio) y el promedio del ciclo finito y > 0.
  if (last3.length < 3 || !last3.every((d) => isFiniteNumber(d.gasto))) return null
  const last3Avg = last3.reduce((s, d) => s + d.gasto, 0) / 3
  const cycleAvg = args.view.promedioDiario
  if (!isFiniteNumber(cycleAvg) || cycleAvg <= 0) return null
  const ratio = last3Avg / cycleAvg
  if (!Number.isFinite(ratio) || ratio < 1.3) return null
  const extra = (last3Avg - cycleAvg) * 3
  return {
    id: 'end-acceleration',
    emoji: '⚠️',
    cat: i18n.t('insights:signals.endAcceleration.cat'),
    title: i18n.t('insights:signals.endAcceleration.title', {
      perDay: fmt(last3Avg),
    }),
    body: i18n.t('insights:signals.endAcceleration.body', {
      last3Avg: fmt(last3Avg),
      cycleAvg: fmt(cycleAvg),
      days: args.diasRestantes,
    }),
    impact: i18n.t('insights:signals.endAcceleration.impact', {
      delta: fmtDelta(-extra),
    }),
    impactRaw: Math.round(extra),
    impactScope: 'cycle',
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.endAcceleration.explanation'),
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
  // Validez: libreHoy finito (NaN >= 0 es false → se colaba) y un cupo
  // diario REAL (> 0). Sin cupo positivo el "nuevo cupo" no tiene sentido.
  if (!isFiniteNumber(args.view.libreHoy) || args.view.libreHoy >= 0) return null
  if (args.diasRestantes <= 1) return null
  if (!isFiniteNumber(args.cupoDiario) || args.cupoDiario <= 0) return null
  const overspend = Math.abs(args.view.libreHoy)
  // Clamp a [0, cupoDiario]: el nuevo cupo nunca puede ser negativo
  // (recomendar "gastá negativo") ni superar el cupo original.
  const newCupo = clampFinite(args.cupoDiario - overspend / args.diasRestantes, 0, args.cupoDiario)
  if (newCupo < args.cupoDiario * 0.4) {
    const framing = framingFor(args.persona ?? 'planner')
    return {
      id: 'recovery-hard',
      emoji: '🧭',
      cat: i18n.t('insights:signals.recoveryHard.cat'),
      title: i18n.t('insights:signals.recoveryHard.title'),
      body: recoveryHardBody(framing, {
        newCupo: fmt(newCupo),
        diasRestantes: args.diasRestantes,
        overspend: fmt(overspend),
      }),
      impact: i18n.t('insights:signals.recoveryHard.impact', {
        overspend: fmt(overspend),
      }),
      impactRaw: Math.round(overspend),
      impactScope: 'oneTime',
      cta: i18n.t('insights:cta.ajustar'),
      urgency: 'alta',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.recoveryHard.explanation'),
      action: { kind: 'open-settings-modal', modal: 'savings-percent' },
    }
  }
  return {
    id: 'recovery-soft',
    emoji: '🧭',
    cat: i18n.t('insights:signals.recoverySoft.cat'),
    title: i18n.t('insights:signals.recoverySoft.title'),
    body: i18n.t('insights:signals.recoverySoft.body', {
      overspend: fmt(overspend),
      newCupo: fmt(newCupo),
    }),
    impact: i18n.t('insights:signals.recoverySoft.impact', { newCupo: fmt(newCupo) }),
    impactRaw: Math.round(overspend),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.recoverySoft.explanation'),
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
  // Validez: el forecast y el momentum del snapshot deben ser finitos, y el
  // cupo diario > 0 (sino libreMes colapsa a 0/negativo → falso "frenar").
  if (!isFiniteNumber(v.forecast_close_amount) || !isFiniteNumber(v.momentum)) return null
  if (!isFiniteNumber(args.cupoDiario) || args.cupoDiario <= 0) return null
  // Compará el forecast de cierre contra el PRESUPUESTO del ciclo (libreMes =
  // ingreso/override − fijos − ahorro), NO contra gastoProyectadoMes. Usamos el
  // libreMes REAL del modelo (view.libreMesTotal), no `cupoDiario × diasVel`: con
  // override el cupo es saldo/díasRestantes (ya resta el variable gastado), así
  // que reconstruir libreMes desde el cupo daba un presupuesto inflado y un
  // `over` mal calculado. El overshoot correcto es `forecast − presupuesto`.
  const libreMes = args.view.libreMesTotal
  if (!isFiniteNumber(libreMes) || libreMes <= 0) return null
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
    cat: i18n.t('insights:signals.velocity.cat'),
    title: stressTitle(v.stress_level),
    body: velocityBody(framing, {
      forecast: fmt(v.forecast_close_amount),
      momentumPct: Math.max(0, Math.round((v.momentum - 1) * 100)),
      faster: v.momentum > 1,
      over: over > 0 ? fmt(over) : null,
    }),
    impact:
      over > 0
        ? i18n.t('insights:signals.velocity.impactFrenar', { delta: fmtDelta(-over) })
        : i18n.t('insights:signals.velocity.impactMantener'),
    impactRaw: Math.max(0, Math.round(over)),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.entendido'),
    urgency,
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.velocity.explanation'),
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
  // Validez: el sobrante proyectado y el cupo deben ser finitos antes de
  // calcular la contribución propuesta (sino `proposed` sale NaN → copy rota).
  if (!isFiniteNumber(args.view.sobrantePresupuestadoMes) || !isFiniteNumber(args.cupoDiario)) {
    return null
  }
  if (args.view.sobrantePresupuestadoMes < args.cupoDiario * 2) return null
  const sobra = args.view.sobrantePresupuestadoMes
  const hasActiveGoal = !!(args.savingsGoal && args.savingsGoal.isActive)
  // Round the contribution down to the nearest 1k for nicer copy.
  const proposed = Math.max(0, Math.floor((sobra * 0.5) / 1000) * 1000)
  const framing = framingFor(args.persona ?? 'planner')
  return {
    id: 'positive-forecast',
    emoji: '🌱',
    cat: i18n.t('insights:signals.positiveForecast.cat'),
    title: i18n.t('insights:signals.positiveForecast.title', { sobra: fmt(sobra) }),
    body: positiveForecastBody(framing, {
      sobra: fmt(sobra),
      proposed: hasActiveGoal && proposed > 0 ? fmt(proposed) : null,
      goalTitle: hasActiveGoal && args.savingsGoal ? args.savingsGoal.title : null,
      diasRestantes: args.diasRestantes,
    }),
    impact: hasActiveGoal && proposed > 0
      ? i18n.t('insights:signals.positiveForecast.impactGoal', { proposed: fmt(proposed) })
      : i18n.t('insights:signals.positiveForecast.impactClose', { sobra: fmt(sobra) }),
    impactRaw: Math.round(proposed > 0 ? proposed : sobra),
    impactScope: 'oneTime',
    cta: hasActiveGoal && proposed > 0
      ? i18n.t('insights:signals.positiveForecast.ctaMover', { proposed: fmt(proposed) })
      : i18n.t('insights:signals.positiveForecast.ctaVerMeta'),
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.positiveForecast.explanation'),
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
  if (!isFiniteNumber(topNow.amount) || topNow.amount <= 0) return null
  const historicalAvg = avgCategoryFromSummaries(args.summaries, topNow.name)
  if (!isFiniteNumber(historicalAvg) || historicalAvg <= 0) return null
  const ratio = topNow.amount / historicalAvg
  if (!Number.isFinite(ratio)) return null
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
  const titleSuffix = spike ? i18n.t('insights:signals.catAccel.titleSpikeSuffix') : ''
  const body = spike
    ? i18n.t('insights:signals.catAccel.bodySpike', {
        amount: fmt(topNow.amount),
        category: topNow.displayName,
        avg: fmt(historicalAvg),
      })
    : i18n.t('insights:signals.catAccel.bodyTrend', {
        amount: fmt(topNow.amount),
        category: topNow.displayName,
        avg: fmt(historicalAvg),
      })
  return {
    id: 'cat-accel',
    emoji: spike ? '🎯' : '📈',
    // `cat` = nombre CRUDO (load-bearing: los chips de gastos/banner lo
    // matchean por raw name). El display va por `displayName`.
    cat: topNow.name,
    title: i18n.t('insights:signals.catAccel.title', {
      category: topNow.displayName,
      suffix: titleSuffix,
    }),
    body,
    impact: i18n.t('insights:signals.catAccel.impact', { delta: fmtDelta(-delta) }),
    impactRaw: Math.round(delta),
    cta: i18n.t('insights:cta.verGastos'),
    urgency: 'media',
    // 1 prior summary is weak evidence but the signal already gates on
    // `historicalAvg > 0`, so floor the summaries multiplier at 0.5
    // — otherwise rampOneCycle(14) × rampSummaries(1) = 0.33 falls
    // below MIN_CONFIDENCE and a fully-populated cycle gets dropped.
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      Math.max(0.5, rampSummaries(args.summaries.length)),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.catAccel.explanation'),
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
  // `rawCategoryName` = nombre CRUDO (load-bearing: el banner de
  // add-expense matchea `signal.cat` por raw name). `categoryDisplayName`
  // = localizado, SOLO para el copy del título.
  const rawCategoryName = (id: string) =>
    args.categoriesExpense.find((c) => c.id === id)?.name ??
    i18n.t('insights:signals.cap.categoryFallback')
  const categoryDisplayName = (id: string) => {
    const c = args.categoriesExpense.find((cat) => cat.id === id)
    return c?.displayName ?? c?.name ?? i18n.t('insights:signals.cap.categoryFallback')
  }

  const out: ControlAdvisorTask[] = []
  for (const limit of args.limits) {
    // Validez: cap REAL (> 0), umbral en (0,100], y gasto finito ≥ 0. Un cap
    // ≤ 0 haría threshold ≤ 0 → todo gasto "rompe" el límite (falso positivo).
    if (!isFiniteNumber(limit.monthly_cap) || limit.monthly_cap <= 0) continue
    const pctThreshold = clampFinite(limit.warning_threshold_pct, 1, 100)
    const spent = byCategoryId.get(limit.category_id) ?? 0
    if (!isFiniteNumber(spent) || spent < 0) continue
    const threshold = limit.monthly_cap * (pctThreshold / 100)
    if (spent < threshold) continue
    const rawName = rawCategoryName(limit.category_id)
    const name = categoryDisplayName(limit.category_id)
    const pct = Math.round((spent / limit.monthly_cap) * 100)
    const breach = spent > limit.monthly_cap
    out.push({
      id: `cap-${limit.id}`,
      emoji: breach ? '🚫' : '⚠️',
      cat: rawName,
      title: breach
        ? i18n.t('insights:signals.cap.titleBreach', { name })
        : i18n.t('insights:signals.cap.titleWarning', { name, pct }),
      body: breach
        ? i18n.t('insights:signals.cap.bodyBreach', {
            cap: fmt(limit.monthly_cap),
            spent: fmt(spent),
            excess: fmt(spent - limit.monthly_cap),
          })
        : i18n.t('insights:signals.cap.bodyWarning', {
            spent: fmt(spent),
            cap: fmt(limit.monthly_cap),
            remaining: fmt(limit.monthly_cap - spent),
          }),
      impact: breach
        ? i18n.t('insights:signals.cap.impactBreach', {
            delta: fmtDelta(-(spent - limit.monthly_cap)),
          })
        : i18n.t('insights:signals.cap.impactWarning', { cap: fmt(limit.monthly_cap) }),
      impactRaw: breach ? Math.round(spent - limit.monthly_cap) : 0,
      // Overshoot is for THIS cycle only — not a recurring monthly amount.
      impactScope: 'cycle',
      cta: i18n.t('insights:cta.verDetalle'),
      urgency: breach ? 'alta' : 'media',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.cap.explanation'),
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
  if (!isFiniteNumber(total) || total <= 0) return null
  const top = byCategory.sort((a, b) => b.amount - a.amount)[0]!
  if (!isFiniteNumber(top.amount) || top.amount <= 0) return null
  const share = top.amount / total
  if (!Number.isFinite(share)) return null
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
    // `cat` = nombre CRUDO (load-bearing: el merge cat-accel⊕cat-dominance
    // y los chips de gastos lo matchean por raw name). Display = displayName.
    cat: top.name,
    title: i18n.t('insights:signals.catDominance.title', {
      category: top.displayName,
      amount: fmt(top.amount),
    }),
    body: i18n.t('insights:signals.catDominance.body', {
      total: fmt(total),
      amount: fmt(top.amount),
      category: top.displayName,
    }),
    impact: i18n.t('insights:signals.catDominance.impact', { save: fmt(save10) }),
    impactRaw: Math.round(save10),
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.catDominance.explanation'),
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
  let bestWin: {
    name: string
    displayName: string
    now: number
    avg: number
    delta: number
  } | null = null
  for (const c of byCategory) {
    if (!isFiniteNumber(c.amount) || c.amount < 0) continue
    // Match por nombre CRUDO (los summaries guardan el name en español).
    const avg = avgCategoryFromSummaries(args.summaries, c.name)
    if (!isFiniteNumber(avg) || avg <= 0) continue
    const ratio = c.amount / avg
    if (ratio > 0.7) continue
    const delta = avg - c.amount
    if (delta < minDelta) continue
    if (!bestWin || delta > bestWin.delta) {
      bestWin = { name: c.name, displayName: c.displayName, now: c.amount, avg, delta }
    }
  }
  if (!bestWin) return null
  const pct = Math.round(((bestWin.avg - bestWin.now) / bestWin.avg) * 100)
  return {
    id: 'cat-win',
    emoji: '✅',
    // `cat` = nombre CRUDO (los chips de gastos lo matchean por raw name).
    cat: bestWin.name,
    title: i18n.t('insights:signals.catWin.title', { category: bestWin.displayName, pct }),
    body: i18n.t('insights:signals.catWin.body', {
      now: fmt(bestWin.now),
      avg: fmt(bestWin.avg),
      annual: fmt(bestWin.delta * 12),
    }),
    impact: i18n.t('insights:signals.catWin.impact', { delta: fmt(bestWin.delta) }),
    impactRaw: Math.round(bestWin.delta),
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'baja',
    // Floor the summaries multiplier at 0.5 — see cat-accel above.
    // The signal already gates on at least one prior summary with a
    // non-zero category avg; the multiplier shouldn't suppress the
    // signal entirely on a fully closed first cycle.
    confidence:
      rampOneCycle(args.view.detalleDias.length) *
      Math.max(0.5, rampSummaries(args.summaries.length)),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.catWin.explanation'),
    action: { kind: 'dismiss', dismissId: 'cat-win' },
  }
}

// ─── Group 3 — Expense hygiene ──────────────────────────────────────

/** Small frequent leaks — many sub-$5k expenses that add up. */
function buildSmallLeaksInsight(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const discretionary = args.expenses.filter((e) => !e.commitment_id)
  const small = discretionary.filter((e) => {
    const p = Number(e.price ?? 0)
    return isFiniteNumber(p) && p >= 0 && p < 5000
  })
  if (small.length < 10) return null
  // Necesitamos cupo REAL y ≥3 días cerrados: sin eso el % del ciclo se infla
  // con un denominador chico y la señal sobre-dispara en ciclos recién abiertos.
  if (!isFiniteNumber(args.cupoDiario) || args.cupoDiario <= 0) return null
  if (args.view.detalleDias.length < 3) return null
  const total = small.reduce((s, e) => s + Number(e.price ?? 0), 0)
  const pctOfCycle = total / (args.cupoDiario * args.view.detalleDias.length)
  if (!Number.isFinite(pctOfCycle) || pctOfCycle < 0.12) return null
  return {
    id: 'small-leaks',
    emoji: '💧',
    cat: i18n.t('insights:signals.smallLeaks.cat'),
    title: i18n.t('insights:signals.smallLeaks.title', {
      count: small.length,
      total: fmt(total),
    }),
    body: i18n.t('insights:signals.smallLeaks.body', {
      pct: Math.round(pctOfCycle * 100),
    }),
    impact: i18n.t('insights:signals.smallLeaks.impact', { amount: fmt(total * 0.3) }),
    impactRaw: Math.round(total * 0.3),
    cta: i18n.t('insights:cta.verDetalle'),
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.smallLeaks.explanation'),
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
    const d = new Date(e.created_at)
    const amt = Number(e.price ?? 0)
    // Validez: timestamp parseable y monto finito ≥ 0 (un created_at inválido
    // daría getHours()=NaN y contaminaría los totales).
    if (Number.isNaN(d.getTime()) || !isFiniteNumber(amt) || amt < 0) continue
    const h = d.getHours()
    totalAmount += amt
    // 22hs → 02hs covers AR night-impulse window without false-firing
    // on AR's typical late dinners (20-21hs).
    if (h >= 22 || h < 2) {
      night += 1
      nightAmount += amt
    }
  }
  if (totalAmount <= 0) return null
  const nightPct = (nightAmount / totalAmount) * 100
  if (!Number.isFinite(nightPct) || nightPct < 70) return null
  return {
    id: 'night-impulse',
    emoji: '🌙',
    cat: i18n.t('insights:signals.nightImpulse.cat'),
    title: i18n.t('insights:signals.nightImpulse.title', { amount: fmt(nightAmount) }),
    body: i18n.t('insights:signals.nightImpulse.body', {
      count: night,
      total: discretionary.length,
      amount: fmt(nightAmount),
    }),
    impact: i18n.t('insights:signals.nightImpulse.impact', {
      amount: fmt(nightAmount * 0.2),
    }),
    impactRaw: Math.round(nightAmount * 0.2),
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'media',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.nightImpulse.explanation'),
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
  if (!porDowEnriched || porDowEnriched.length < 7) return null
  if (!isFiniteNumber(globalAvg) || globalAvg <= 0) return null

  // ── Candidate A: worst single DoW
  // Use actual cycle length to compute how many of this weekday fall
  // in a typical month — `cycleDays / 7` (≈ 4.28 for a 30-day cycle).
  // The hardcoded `* 4` was correct only for 28-day cycles and
  // under-counted impact by ~7% for longer cycles.
  const cycleDays =
    args.view.detalleDias.length + args.view.diasRestantes
  let dowExtra = 0
  let dowName = ''
  if (
    peorDow &&
    isFiniteNumber(peorDow.avg) &&
    peorDow.avg > 0 &&
    isFiniteNumber(peorDow.ratio) &&
    peorDow.ratio >= 1.4
  ) {
    const monthlyOccurrences = cycleDays / 7
    dowExtra = (peorDow.avg - globalAvg) * monthlyOccurrences
    const peorDowIdx = dowIndexFromName(peorDow.name)
    dowName =
      peorDowIdx >= 0
        ? weekdayLongFromMondayIndex(peorDowIdx)
        : peorDow.name.toLowerCase()
  }

  // ── Candidate B: weekend premium
  let wkExtra = 0
  let wkRatio = 0
  let wkdayAvgValue = 0
  let weekendAvgValue = 0
  const weekend = porDowEnriched.filter(
    (d) => (d.name === 'Sáb' || d.name === 'Dom') && isFiniteNumber(d.avg) && d.avg > 0,
  )
  // Necesitamos ≥1 día de finde y ≥1 de semana con gasto finito. El ruido de
  // muestras chicas ya lo descuenta la confianza (rampThreeWeeks); un patrón
  // de un solo día de finde es válido (no errático) y se respeta.
  if (weekend.length >= 1) {
    weekendAvgValue =
      weekend.reduce((s, d) => s + d.avg, 0) / weekend.length
    const weekday = porDowEnriched.filter(
      (d) => d.name !== 'Sáb' && d.name !== 'Dom' && isFiniteNumber(d.avg) && d.avg > 0,
    )
    if (weekday.length >= 1 && weekendAvgValue > 0) {
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
  const useDow = Number.isFinite(dowExtra) && dowExtra >= wkExtra && dowExtra >= 5000
  const useWeekend = !useDow && Number.isFinite(wkExtra) && wkExtra >= 8000
  if (!useDow && !useWeekend) return null

  if (useDow) {
    return {
      id: 'weekly-pattern',
      emoji: '🗓️',
      cat: i18n.t('insights:signals.weeklyPattern.catDow'),
      title: i18n.t('insights:signals.weeklyPattern.titleDow', { day: dowName }),
      body: i18n.t('insights:signals.weeklyPattern.bodyDow', {
        day: dowName,
        extra: fmt(dowExtra),
      }),
      impact: i18n.t('insights:signals.weeklyPattern.impactDow', { extra: fmt(dowExtra) }),
      impactRaw: Math.round(dowExtra),
      cta: i18n.t('insights:cta.entendido'),
      urgency: 'baja',
      confidence: rampThreeWeeks(args.view.detalleDias.length),
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.weeklyPattern.explanationDow'),
      action: { kind: 'dismiss', dismissId: 'weekly-pattern' },
    }
  }

  return {
    id: 'weekly-pattern',
    emoji: '🎉',
    cat: i18n.t('insights:signals.weeklyPattern.catWeekend'),
    title: i18n.t('insights:signals.weeklyPattern.titleWeekend'),
    body: i18n.t('insights:signals.weeklyPattern.bodyWeekend', {
      weekday: fmt(wkdayAvgValue),
      weekend: fmt(weekendAvgValue),
    }),
    impact: i18n.t('insights:signals.weeklyPattern.impactWeekend', { extra: fmt(wkExtra) }),
    impactRaw: Math.round(wkExtra),
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'baja',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.weeklyPattern.explanationWeekend'),
    action: { kind: 'dismiss', dismissId: 'weekly-pattern' },
  }
}

// ─── Group 5 — Commitments & income health ──────────────────────────

/** Fijos-to-income ratio health check. */
function buildFijosRatioHealth(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (!isFiniteNumber(args.ingresoMes) || args.ingresoMes <= 0) return null
  if (!isFiniteNumber(args.fijosMes) || args.fijosMes < 0) return null
  const ratio = args.fijosMes / args.ingresoMes
  if (!Number.isFinite(ratio) || ratio < 0.6) return null
  const target = args.ingresoMes * 0.5
  const excess = args.fijosMes - target
  const severity: ControlAdvisorTask['urgency'] =
    ratio > 0.75 ? 'alta' : 'media'
  const framing = framingFor(args.persona ?? 'planner')
  return {
    id: 'fijos-ratio',
    emoji: '⚖️',
    cat: i18n.t('insights:signals.fijosRatio.cat'),
    title: i18n.t('insights:signals.fijosRatio.title'),
    body:
      args.incomeMode === 'dynamic'
        ? // Dinámico: sin "sueldo" — la referencia son los ingresos del ciclo.
          i18n.t('insights:copy.fijosRatio_dynamic', { excess: fmt(excess) })
        : fijosRatioBody(framing, {
            ratioPct: Math.round(ratio * 100),
            excess: fmt(excess),
            comprometidoPct: Math.round(ratio * 100),
          }),
    impact: i18n.t('insights:signals.fijosRatio.impact', { excess: fmt(excess) }),
    impactRaw: Math.round(excess),
    cta: i18n.t('insights:cta.verFijos'),
    urgency: severity,
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation:
      args.incomeMode === 'dynamic'
        ? i18n.t('insights:signals.fijosRatio.explanationDynamic')
        : i18n.t('insights:signals.fijosRatio.explanation'),
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' },
  }
}

/** Income volatility — current vs 3-month historical avg ±10%. */
function buildIncomeVolatility(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  if (args.summaries.length < 2) return null
  // Comparar el sueldo RECURRENTE contra el histórico de sueldo. Con override
  // activo, ingresoMes = la caja del ciclo (un ajuste de UN ciclo) → compararla
  // vs el take-home histórico daría un falso "tu ingreso bajó/subió $X".
  // ingresoRecurrente = family_finance.monthly_income (sin override ni extras).
  // DINÁMICO: la referencia son los income_events — ingresoRecurrente llega
  // como Σ del ciclo y el histórico sale de `extra_income` de los cierres
  // (monthly_income histórico es 0 por diseño en dinámico).
  const isDynamic = args.incomeMode === 'dynamic'
  const income = args.ingresoRecurrente ?? args.ingresoMes
  if (!isFiniteNumber(income) || income <= 0) return null
  const historicalAvg =
    args.summaries
      .slice(0, 3)
      .reduce(
        (s, x) =>
          s +
          (isDynamic
            ? finiteOr(Number(x.extra_income ?? 0), 0)
            : x.monthly_income),
        0,
      ) / Math.min(3, args.summaries.length)
  if (!isFiniteNumber(historicalAvg) || historicalAvg <= 0) return null
  const delta = income - historicalAvg
  const pct = (delta / historicalAvg) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) < 10) return null
  const better = pct > 0
  const action: ControlAction = better
    ? { kind: 'open-savings-goal' }
    : { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' }
  return {
    id: 'income-volatility',
    emoji: better ? '📈' : '📉',
    cat: i18n.t('insights:signals.incomeVolatility.cat'),
    title: better
      ? i18n.t('insights:signals.incomeVolatility.titleBetter', {
          amount: fmt(income),
        })
      : i18n.t('insights:signals.incomeVolatility.titleWorse', {
          amount: fmt(income),
        }),
    body: better
      ? i18n.t('insights:signals.incomeVolatility.bodyBetter', {
          avg: fmt(historicalAvg),
          delta: fmt(Math.abs(delta)),
        })
      : i18n.t('insights:signals.incomeVolatility.bodyWorse', {
          avg: fmt(historicalAvg),
          delta: fmt(Math.abs(delta)),
        }),
    impact: fmtDelta(delta),
    impactRaw: Math.abs(Math.round(delta)),
    cta: better ? i18n.t('insights:cta.verMeta') : i18n.t('insights:cta.verFijos'),
    urgency: better ? 'baja' : 'media',
    confidence: rampSummaries(args.summaries.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.incomeVolatility.explanation'),
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
    if (!isFiniteNumber(c.amount) || c.amount < 0) continue
    const score = scoreSubscriptionUsage(c, now)
    // Validez: el scorer podría devolver algo inesperado → nunca derefenciar
    // a ciegas (TypeError) ni mostrar un check-in sin decisión clara.
    if (!score || typeof score.shouldAsk !== 'boolean' || !score.shouldAsk) continue
    const id = `sub-usage-${c.fixedExpenseId}`
    let title: string
    let body: string
    let urgency: ControlAdvisorTask['urgency']
    let replies: ControlAdvisorTask['replies'] = [
      { label: i18n.t('insights:reply.mucho'), action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'mucho', dismissId: id } },
      { label: i18n.t('insights:reply.aVeces'), action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'a_veces', dismissId: id } },
      { label: i18n.t('insights:reply.casiNunca'), action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'casi_nunca', dismissId: id } },
    ]
    if (score.flag === 'hard') {
      title = i18n.t('insights:signals.subUsage.titleHard', { name: c.name })
      body = i18n.t('insights:signals.subUsage.bodyHard', {
        name: c.name,
        amount: fmt(c.amount),
        annual: fmt(c.amount * 12),
      })
      urgency = 'alta'
      replies = [
        { label: i18n.t('insights:reply.cancelar'), action: { kind: 'sub-usage-cancel', fixedExpenseId: c.fixedExpenseId, dismissId: id } },
        { label: i18n.t('insights:reply.laSigoUsando'), action: { kind: 'sub-usage-answer', fixedExpenseId: c.fixedExpenseId, level: 'mucho', dismissId: id } },
      ]
    } else if (score.flag === 'soft') {
      title = i18n.t('insights:signals.subUsage.titleSoft', { name: c.name })
      body = i18n.t('insights:signals.subUsage.bodySoft', { amount: fmt(c.amount) })
      urgency = 'media'
    } else if (score.prompt === 'pay') {
      title = i18n.t('insights:signals.subUsage.titlePay', { name: c.name })
      body = i18n.t('insights:signals.subUsage.bodyPay', {
        name: c.name,
        amount: fmt(c.amount),
      })
      urgency = 'baja'
    } else {
      title = i18n.t('insights:signals.subUsage.titleReask', { name: c.name })
      body = i18n.t('insights:signals.subUsage.bodyReask', {
        name: c.name,
        amount: fmt(c.amount),
      })
      urgency = 'baja'
    }
    out.push({
      id,
      emoji: score.flag === 'hard' ? '🧟' : '📺',
      cat: i18n.t('insights:signals.subUsage.cat'),
      title,
      body,
      impact: i18n.t('insights:signals.subUsage.impact', { amount: fmt(c.amount) }),
      impactRaw: Math.round(c.amount),
      impactScope: 'monthly',
      cta: i18n.t('insights:cta.responder'),
      urgency,
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.subUsage.explanation'),
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
  return hikes
    .slice(0, 2)
    .map((n): ControlAdvisorTask | null => {
    const name = (n.metadata.name as string) ?? i18n.t('insights:signals.hike.nameFallback')
    // Metadata puede venir corrupta (string '$5000', faltante) → coercemos a
    // finito y, sin un aumento real (delta finito > 0), no mostramos la señal.
    const prev = finiteOr(Number(n.metadata.previous_amount ?? 0), 0)
    const next = finiteOr(Number(n.metadata.new_amount ?? 0), 0)
    const pctRaw = Number(n.metadata.delta_pct ?? 0)
    const pct = Number.isFinite(pctRaw) ? pctRaw : 0
    const delta = next - prev
    if (!Number.isFinite(delta) || delta <= 0) return null
    return {
      id: `hike-${n.id}`,
      emoji: '⚡',
      cat: i18n.t('insights:signals.hike.cat'),
      title: i18n.t('insights:signals.hike.title', { name, pct: pct.toFixed(0) }),
      body: i18n.t('insights:signals.hike.body', {
        prev: fmt(prev),
        next: fmt(next),
        annual: fmt(delta * 12),
      }),
      impact: i18n.t('insights:signals.hike.impact', { delta: fmtDelta(-delta) }),
      impactRaw: Math.round(delta),
      cta: i18n.t('insights:cta.comparar'),
      urgency: 'baja',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.hike.explanation'),
      action: {
        kind: 'open-fixed-expense',
        fixedExpenseId: String(n.metadata.fixed_expense_id ?? ''),
      },
    }
    })
    .filter((t): t is ControlAdvisorTask => t !== null)
}

// ─── Group 6 — Savings ──────────────────────────────────────────────

/** Savings goal feasibility check. */
function buildSavingsFeasibility(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  // Validez: montos de la meta y el vault finitos antes de cualquier cuenta.
  if (!isFiniteNumber(goal.goalAmount) || goal.goalAmount <= 0) return null
  if (!isFiniteNumber(goal.currentAmount)) return null
  const missing = Math.max(0, goal.goalAmount - goal.currentAmount)
  if (missing <= 0) return null
  const months = goal.targetMonths ?? 0
  if (months <= 0) return null
  const monthlyNeeded = missing / months
  const monthlyActual = args.view.vault
  if (!isFiniteNumber(monthlyActual) || monthlyActual >= monthlyNeeded) return null
  const shortfall = monthlyNeeded - monthlyActual
  return {
    id: 'savings-feasibility',
    emoji: '🎯',
    cat: goal.title,
    title: i18n.t('insights:signals.savingsFeasibility.title', {
      goal: goal.title,
      shortfall: fmt(shortfall),
    }),
    body: i18n.t('insights:signals.savingsFeasibility.body', {
      perWeek: fmt(monthlyNeeded / 4),
      actual: fmt(monthlyActual),
    }),
    impact: i18n.t('insights:signals.savingsFeasibility.impact', {
      shortfall: fmt(shortfall),
    }),
    impactRaw: Math.round(shortfall),
    cta: i18n.t('insights:cta.verMeta'),
    urgency: 'media',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.savingsFeasibility.explanation'),
    action: { kind: 'open-savings-goal' },
  }
}

/** Savings overachievement — ahead of plan. */
function buildSavingsOverachievement(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  if (!isFiniteNumber(goal.goalAmount) || goal.goalAmount <= 0) return null
  if (!isFiniteNumber(goal.currentAmount)) return null
  const months = goal.targetMonths ?? 0
  if (months <= 0) return null
  const missing = Math.max(0, goal.goalAmount - goal.currentAmount)
  if (missing <= 0) return null
  const planned = missing / months
  const actual = args.view.vault
  if (!isFiniteNumber(actual) || actual <= planned * 1.15) return null
  const newMonths = Math.max(1, Math.round(missing / actual))
  const saved = months - newMonths
  if (saved < 1) return null
  return {
    id: 'savings-over',
    emoji: '🚀',
    cat: goal.title,
    title: i18n.t('insights:signals.savingsOver.title', { count: saved }),
    body: i18n.t('insights:signals.savingsOver.body', {
      actual: fmt(actual),
      planned: fmt(planned),
      goal: goal.title,
      newMonths,
      months,
    }),
    impact: i18n.t('insights:signals.savingsOver.impact', { count: saved }),
    impactRaw: Math.round(actual - planned),
    cta: i18n.t('insights:cta.verMeta'),
    urgency: 'baja',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.savingsOver.explanation'),
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
  if (!isFiniteNumber(args.cupoDiario) || args.cupoDiario <= 0) return null
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
  let max: Expense | null = null
  for (const e of todayExpenses) {
    const p = Number(e.price ?? 0)
    if (!isFiniteNumber(p)) continue
    if (!max || p > Number(max.price ?? 0)) max = e
  }
  if (!max) return null
  const price = Number(max.price ?? 0)
  if (price < args.cupoDiario * 0.3) return null
  const pct = Math.round((price / args.cupoDiario) * 100)
  return {
    id: 'high-single-expense',
    emoji: '💥',
    cat: i18n.t('insights:signals.highSingle.cat'),
    title: i18n.t('insights:signals.highSingle.title', { price: fmt(price) }),
    body: i18n.t('insights:signals.highSingle.body', {
      price: fmt(price),
      pct,
      cupo: fmt(args.cupoDiario),
    }),
    impact: i18n.t('insights:signals.highSingle.impact', { price: fmt(price) }),
    impactRaw: Math.round(price),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.verDetalle'),
    urgency: 'media',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.highSingle.explanation'),
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
    if (!isFiniteNumber(lo) || lo <= 0 || !isFiniteNumber(hi)) continue
    if (hi - lo > lo * 0.05) continue // ±5% tolerance
    const focus = list[list.length - 1]
    return {
      id: `duplicate-${focus.id}`,
      emoji: '🪞',
      cat: i18n.t('insights:signals.duplicate.cat'),
      title: i18n.t('insights:signals.duplicate.title', { count: list.length }),
      body: i18n.t('insights:signals.duplicate.body', {
        count: list.length,
        description: focus.description,
        amount: fmt(hi),
      }),
      impact: i18n.t('insights:signals.duplicate.impact', { amount: fmt(hi) }),
      impactRaw: Math.round(hi),
      impactScope: 'oneTime',
      cta: i18n.t('insights:cta.revisar'),
      urgency: 'baja',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.duplicate.explanation'),
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
  if (Number.isNaN(lastTs)) return null
  const now = (args.now ?? new Date()).getTime()
  const daysSince = Math.floor((now - lastTs) / DAY_MS)
  if (!Number.isFinite(daysSince) || daysSince < 3) return null
  if (daysSince > 14) return null // beyond this we don't pester
  return {
    id: 'data-gap-warning',
    emoji: '📭',
    cat: i18n.t('insights:signals.dataGap.cat'),
    title: i18n.t('insights:signals.dataGap.title', { count: daysSince }),
    body: i18n.t('insights:signals.dataGap.body'),
    impact: i18n.t('insights:signals.dataGap.impact', { count: daysSince }),
    impactRaw: 0,
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.cargarGastos'),
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.dataGap.explanation'),
    action: { kind: 'navigate', route: '/(app)/(tabs)/expenses' },
  }
}

/** Goal hit 100% — positive reinforcement that doubles as a CTA to extend. */
function buildSavingsMilestone(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.isActive) return null
  if (!isFiniteNumber(goal.goalAmount) || goal.goalAmount <= 0 || !isFiniteNumber(goal.currentAmount)) {
    return null
  }
  if (goal.currentAmount < goal.goalAmount) return null
  return {
    id: 'savings-milestone',
    emoji: '🎯',
    cat: goal.title,
    title: i18n.t('insights:signals.savingsMilestone.title'),
    body: i18n.t('insights:signals.savingsMilestone.body', {
      goal: goal.title,
      amount: fmt(goal.currentAmount),
    }),
    impact: i18n.t('insights:signals.savingsMilestone.impact', {
      total: fmt(goal.goalAmount),
    }),
    impactRaw: Math.round(goal.goalAmount),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.verMeta'),
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.savingsMilestone.explanation'),
    action: { kind: 'open-savings-goal' },
  }
}

/** Payday passed but salary not yet confirmed → ask the user to
 *  refresh the cycle balance or adjust the payday. Critical because
 *  the rest of the engine assumes a confirmed cycle anchor. */
function buildIncomeMissing(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  // Rama DINÁMICA: no hay payday que esperar — el equivalente de "cobro
  // no confirmado" es "todavía no registraste ingresos este ciclo".
  // Dispara pasado ~30% del ciclo (mínimo 2 días) sin income_events.
  // Guard de invariante: sin diasCiclo/diasRestantes finitos, silencio.
  if (args.incomeMode === 'dynamic') {
    const total = args.diasCiclo
    if (!isFiniteNumber(total) || total <= 0) return null
    if (!isFiniteNumber(args.diasRestantes)) return null
    const elapsed = Math.max(0, total - args.diasRestantes)
    if (elapsed < Math.max(2, Math.ceil(total * 0.3))) return null
    const cycleIncome = finiteOr(args.ingresoRecurrente ?? args.ingresoMes, 0)
    if (cycleIncome > 0) return null
    return {
      id: 'income-missing',
      emoji: '📭',
      cat: i18n.t('insights:signals.incomeMissingDynamic.cat'),
      title: i18n.t('insights:signals.incomeMissingDynamic.title'),
      body: i18n.t('insights:signals.incomeMissingDynamic.body'),
      impact: i18n.t('insights:signals.incomeMissingDynamic.impact'),
      impactRaw: 0,
      impactScope: 'oneTime',
      cta: i18n.t('insights:cta.actualizar'),
      urgency: 'media',
      confidence: 1.0,
      dataDays: args.view.detalleDias.length,
      dummyExplanation: i18n.t('insights:signals.incomeMissingDynamic.explanation'),
      action: { kind: 'navigate', route: '/(app)/add-income' },
    }
  }
  if (!args.paydayPending) return null
  // El "cobro esperado" es el SUELDO recurrente, no el ingreso del ciclo: los
  // income_events one-time (transferencias, sobrantes) ya llegaron y no son lo
  // que se espera. Coercemos a finito (0 = monto desconocido → copy "confirmar").
  const expected = finiteOr(args.ingresoRecurrente ?? args.ingresoMes, 0)
  return {
    id: 'income-missing',
    emoji: '📭',
    cat: i18n.t('insights:signals.incomeMissing.cat'),
    title: i18n.t('insights:signals.incomeMissing.title'),
    body: i18n.t('insights:signals.incomeMissing.body'),
    impact:
      expected > 0
        ? i18n.t('insights:signals.incomeMissing.impactExpected', {
            amount: fmt(expected),
          })
        : i18n.t('insights:signals.incomeMissing.impactConfirm'),
    impactRaw: Math.round(expected),
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.actualizar'),
    urgency: 'alta',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.incomeMissing.explanation'),
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' },
  }
}

/** First 1-2 days of cycle: structural libreRatio < 25% means tight month ahead. */
function buildCycleStartProjection(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const closedDays = args.view.detalleDias.length
  if (closedDays > 2) return null
  if (!isFiniteNumber(args.ingresoMes) || args.ingresoMes <= 0) return null
  if (!isFiniteNumber(args.fijosMes)) return null
  const monthlyGoalNeed =
    args.savingsGoal && args.savingsGoal.isActive && args.savingsGoal.targetMonths
      ? Math.max(
          0,
          (args.savingsGoal.goalAmount - args.savingsGoal.currentAmount) /
            args.savingsGoal.targetMonths,
        )
      : 0
  const libre = args.ingresoMes - args.fijosMes - monthlyGoalNeed
  if (!isFiniteNumber(libre) || libre <= 0) return null
  const libreRatio = libre / args.ingresoMes
  if (!Number.isFinite(libreRatio) || libreRatio >= 0.25) return null
  const target = Math.round(args.ingresoMes * 0.25)
  const gap = Math.max(0, target - libre)
  const pct = Math.round(libreRatio * 100)
  return {
    id: 'cycle-start-projection',
    emoji: '🪶',
    cat: i18n.t('insights:signals.cycleStart.cat'),
    title: i18n.t('insights:signals.cycleStart.title', { pct }),
    body:
      monthlyGoalNeed > 0
        ? i18n.t('insights:signals.cycleStart.bodyWithGoal', { libre: fmt(libre), pct })
        : i18n.t('insights:signals.cycleStart.bodyNoGoal', { libre: fmt(libre), pct }),
    impact: i18n.t('insights:signals.cycleStart.impact', { gap: fmt(gap) }),
    impactRaw: gap,
    impactScope: 'monthly',
    cta: i18n.t('insights:cta.verFijos'),
    urgency: 'media',
    confidence: 1.0,
    dataDays: closedDays,
    dummyExplanation: i18n.t('insights:signals.cycleStart.explanation'),
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
  // Validez: el forecast pesimista debe ser finito y > 0 (NaN/Infinity ≤ 0 es
  // false → se colaba y producía gapDays/gapAmount basura), y el restante ≥ 0.
  if (!isFiniteNumber(f.pessimistic.dailyAvg) || f.pessimistic.dailyAvg <= 0) return null
  if (!isFiniteNumber(f.pessimistic.totalProjected)) return null
  const remaining = args.view.restanteMes
  if (!isFiniteNumber(remaining) || remaining < 0) return null
  if (f.pessimistic.totalProjected <= remaining) return null
  const daysToZero = Math.floor(remaining / f.pessimistic.dailyAvg)
  if (daysToZero >= args.diasRestantes) return null
  const gapDays = args.diasRestantes - daysToZero
  if (gapDays <= 0) return null
  const gapAmount = Math.round(f.pessimistic.dailyAvg * gapDays)
  return {
    id: 'forecast-payday-gap',
    emoji: '⏳',
    cat: i18n.t('insights:signals.forecastPaydayGap.cat'),
    title: i18n.t('insights:signals.forecastPaydayGap.title', { count: gapDays }),
    body: i18n.t('insights:signals.forecastPaydayGap.body', { count: gapDays }),
    impact: i18n.t('insights:signals.forecastPaydayGap.impact', { amount: fmt(gapAmount) }),
    impactRaw: gapAmount,
    impactScope: 'oneTime',
    cta: i18n.t('insights:cta.ajustarPlan'),
    urgency: 'alta',
    confidence: rampOneCycle(args.view.detalleDias.length),
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.forecastPaydayGap.explanation'),
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' },
  }
}

// ─── Group 8 — Positive reinforcement ───────────────────────────────

function buildStreakEncouragement(
  args: BuildSignalsArgs,
): ControlAdvisorTask | null {
  const racha = args.view.racha
  if (!isFiniteNumber(racha) || racha < 3) return null
  return {
    id: 'streak-ok',
    emoji: '🔥',
    cat: i18n.t('insights:signals.streak.cat'),
    title: i18n.t('insights:signals.streak.title', { count: racha }),
    body: i18n.t('insights:signals.streak.body', {
      amount: fmt(Math.max(0, args.view.sobrantePresupuestadoMes)),
    }),
    impact: i18n.t('insights:signals.streak.impact', { cupo: fmt(args.cupoDiario) }),
    impactRaw: 0,
    cta: i18n.t('insights:cta.entendido'),
    urgency: 'baja',
    confidence: 1.0,
    dataDays: args.view.detalleDias.length,
    dummyExplanation: i18n.t('insights:signals.streak.explanation'),
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
  // Backstop: si un builder llegara con un valor no finito (no debería —
  // cada uno valida sus inputs), nunca emitimos "$NaN" a la UI. El filtro de
  // impactRaw del orquestador igual descarta esas señales.
  const safe = Number.isFinite(n) ? n : 0
  const round = Math.round(Math.abs(safe))
  return '$' + round.toLocaleString(getIntlLocale())
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
): Array<{ id: string; name: string; displayName: string; amount: number }> {
  const byId = new Map<string, number>()
  for (const e of expenses) {
    if (e.commitment_id) continue
    // Fix de raíz: precios no finitos o negativos (corrupción/data error)
    // contaminarían los totales por categoría que consumen cat-accel,
    // cat-dominance y cat-win. Se excluyen acá una sola vez.
    const price = Number(e.price ?? 0)
    if (!isFiniteNumber(price) || price < 0) continue
    byId.set(e.category_id, (byId.get(e.category_id) ?? 0) + price)
  }
  return Array.from(byId.entries()).map(([id, amount]) => {
    const cat = categories.find((c) => c.id === id)
    // `name` = crudo de DB (load-bearing: matchea contra los
    // `category_breakdown[].name` de los summaries, que el server guarda
    // en español). `displayName` = localizado, SOLO para mostrar.
    const fallback = i18n.t('insights:signals.fallbackCategory')
    return {
      id,
      name: cat?.name ?? fallback,
      displayName: cat?.displayName ?? cat?.name ?? fallback,
      amount,
    }
  })
}

function groupExpensesByCategoryId(expenses: Expense[]): Map<string, number> {
  const byId = new Map<string, number>()
  for (const e of expenses) {
    if (e.commitment_id) continue
    const price = Number(e.price ?? 0)
    if (!isFiniteNumber(price) || price < 0) continue
    byId.set(e.category_id, (byId.get(e.category_id) ?? 0) + price)
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
    if (!isFiniteNumber(amt) || amt < 0) continue
    total += amt
    if (new Date(e.created_at).getTime() >= cutoff) last7 += amt
  }
  if (total <= 0) return false
  const ratio = last7 / total
  return Number.isFinite(ratio) && ratio >= 0.7
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
    // Sólo acumulamos montos finitos: un total NaN/string en el breakdown
    // (corrupción server-side) envenenaría el promedio que usan cat-accel/win.
    if (amount != null && Number.isFinite(amount)) {
      total += amount
      count += 1
    }
  }
  return count > 0 ? total / count : 0
}

function stressTitle(level: VelocitySnapshot['stress_level']): string {
  switch (level) {
    case 'critical':
      return i18n.t('insights:signals.velocity.stressCritical')
    case 'warn':
      return i18n.t('insights:signals.velocity.stressWarn')
    case 'watch':
      return i18n.t('insights:signals.velocity.stressWatch')
    default:
      return i18n.t('insights:signals.velocity.stressStable')
  }
}

export type { DayDetail, DowBucket }
