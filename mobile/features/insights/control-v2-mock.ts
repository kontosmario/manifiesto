// Control v2 — type contracts, pure math layer, and a dev fixture.
//
// `ControlMockData`, `ControlAdvisorTask`, `computeControlView` are the
// runtime contract consumed by the Control v2 screen.
//
// `CONTROL_MOCK` is a dev-only fixture: realistic numbers used by
// Storybook and historical UI iteration. It is NEVER served to real
// users at runtime. `useControlV2Data` returns the mock `data` shape
// (so downstream components keep their non-null types) but `signals`
// is gated through `resolveControlSignals` and stays empty for new
// accounts. See `control-v2-empty-fallback.ts` for the gate, and
// `control-v2-screen.tsx` (`if (usingMock)`) for the empty state.
//
// If you find yourself reading the values below in a UI test for a
// brand-new user, that is a regression — file a bug.
//
// @i18n-ignore (dev fixture): la copy de `CONTROL_MOCK` (títulos de
// `tareas`, `topExpense.description`, etc.) es SOLO de Storybook /
// iteración de UI y NUNCA se sirve a usuarios reales en runtime (el
// gate `resolveControlSignals` deja `signals` vacío para cuentas
// reales). No se extrae al namespace de i18n por la misma razón que el
// resto de fixtures dev del repo. Los montos/números son mock.

import type {
  MonthlyByMemberEntry,
  MonthlyCategoryBreakdownEntry,
} from '@/features/insights/control-v2-adapter'

export interface ControlMockData {
  /** Monthly take-home income (ARS). */
  ingresoMes: number
  /** Fixed monthly commitments (ARS). */
  fijosMes: number
  /** Discretionary budget for the month = ingresoMes - fijosMes. */
  libreMes: number
  /** Per-day discretionary budget = libreMes / diasMes. */
  cupoDiario: number
  /** Days in the current month (28-31). */
  diasMes: number
  /** Current day of month (1..diasMes). */
  diaActual: number
  /** Current hour (0-23) + minute, used for the `HOY` gauge. */
  horaActual: number
  minActual: number
  /** Today's discretionary spend so far (ARS). */
  gastoHoy: number
  /** Days until the next salary. */
  proximoSueldoEnDias: number
  /** Discretionary spend for each previous closed day of the month.
   *  Length = diaActual - 1 (today is tracked via gastoHoy separately). */
  dias: number[]
  /** Day-of-week for each entry in `dias` (0=Mon..6=Sun). */
  diasDow: number[]
  /** Expected coverage (days) of the salary that fixed expenses eat up. */
  fijosCobertura: number
  /** Day-of-month indices (1-based) that closed with zero discretionary spend. */
  diasSinGastar: number[]
  metaNoSpendSemana: number
  logrosNoSpendSemana: number
  mesPasado: {
    nombre: string
    /** Total discretionary spend at the cycle close. */
    gastoTotal: number
    /** Days that closed at or under the prev cycle's daily cupo. */
    diasBajoCupo: number
    /** total_variable_spent / 30 — used as a baseline daily reference. */
    promedioDiario: number
    /** Top variable-spend category at close. */
    topCat: {
      label: string
      categoryId: string | null
      amount: number
      pct: number
    }
    /** Mood the rollup assigned: 'green'|'yellow'|'red'|null. */
    mood: 'green' | 'yellow' | 'red' | null
    /** Money the user retained at close = max(0, income - total). */
    savingsDelta: number
    /** Single most expensive variable transaction; null when empty. */
    topExpense: {
      description: string
      price: number
    } | null
    /** Sum of current-cycle expenses charged to the same category as
     *  `topCat.categoryId`. Lets the card surface a same-category
     *  comparison ("Top de Marzo: Súper $80K → ya vas $42K en Abril"). */
    currentTopCatSpent: number
    /** Last up-to-3 cycle totals, oldest → newest, including this
     *  one's projection. Powers the sparkline-of-history. */
    trend: number[]
    /** Inclusive cycle range for display ("15 mar – 14 abr"). Only
     *  set when the cycle is NOT calendar-aligned, so users with
     *  `salary_payment_day != 1` see exactly which window the
     *  comparison covers. `null` when calendar-aligned. */
    cycleRangeLabel: string | null
    /** Full category breakdown of the closed cycle (color + pct),
     *  spend-desc. Powers the "en qué se fue" stacked bar. */
    categoryBreakdown: MonthlyCategoryBreakdownEntry[]
    /** Per-member spend at close, spend-desc, only members that spent.
     *  The card shows the "quién gastó" module only when this has 2+
     *  entries (solo accounts / single-spender families collapse to
     *  <2 and the module hides). */
    byMember: MonthlyByMemberEntry[]
    /** Daily spend totals of the closed cycle, in day order. Powers the
     *  rhythm sparkline. */
    dailyTotals: number[]
  }
  /** True only when there's at least one fully-closed previous cycle
   *  with real discretionary spend — the "Vs mes pasado" card stays
   *  hidden / shows a placeholder otherwise. */
  hasPreviousMonth: boolean
  tareas: ControlAdvisorTask[]
}

import type { ControlAction } from '@/features/insights/control-action'
import { computeRobustDailyAverage } from '@/features/insights/robust-daily-average'
import { clampFinite, finiteOr, nonNegFinite, safeDiv } from '@/features/insights/signal-guards'

export interface ControlAdvisorTask {
  id: string
  emoji: string
  cat: string
  title: string
  body: string
  /** Display label for monthly impact, e.g. "+$8.400 por mes". */
  impact: string
  /** Raw monthly savings (ARS) — used to compute the total impact banner. */
  impactRaw: number
  /**
   * Time horizon of `impactRaw`. Drives `annualizedImpact()` for ranking
   * so a one-shot $50k zombie sub doesn't out-rank a $30k/mes velocity warning.
   *  - 'monthly' (default): impactRaw is monthly recurring → ×12 for annual
   *  - 'oneTime': impactRaw is a one-shot recovery (e.g. cycle excedente, suba) → ×1
   *  - 'cycle': impactRaw scoped to current cycle (28-31d) → ×(365/cycleDays)
   */
  impactScope?: 'monthly' | 'oneTime' | 'cycle'
  cta: string
  urgency: 'alta' | 'media' | 'baja'
  /**
   * Plain-language explanation aimed at a user with zero financial
   * literacy. Expandable via a "¿Qué significa?" toggle on the
   * advisor card. Should use analogies, no jargon, and answer
   * "why do I care" in 2-3 sentences.
   */
  dummyExplanation?: string
  /**
   * What the CTA button actually does when tapped. Resolved by
   * `useControlActionDispatcher`. Optional during the mock phase —
   * when omitted, the CTA is a no-op.
   */
  action?: ControlAction
  /**
   * Fila de respuestas rápidas en línea (botones múltiples), p.ej. la
   * escala de uso de suscripción (Mucho / A veces / Casi nunca). Cuando
   * está presente, la card renderiza esta fila EN VEZ del CTA único.
   */
  replies?: { label: string; action: ControlAction }[]
  /**
   * 0–1 score of how reliable this signal is given the data we have.
   * Used to rerank (`score = urgencyWeight × impactRaw × confidence`)
   * and to show "según N días" disclaimers on data-light tasks.
   *
   *  - 1.0 → real-time signal, no historical baseline needed
   *  - 0.7 → solid but improvable as more data lands
   *  - 0.4 → minimum to surface; below that we drop the task
   */
  confidence: number
  /** Closed days of data feeding this signal (excludes today). */
  dataDays: number
  /**
   * Constituent signal ids when this is a super-signal (composition).
   * `undefined` for atomic signals. The UI can render the bullets as
   * sub-items so the user sees the underlying findings at a glance.
   */
  composedOf?: string[]
}

export const CONTROL_MOCK: ControlMockData = {
  ingresoMes: 2_200_000,
  fijosMes: 1_250_000,
  libreMes: 950_000,
  cupoDiario: 31_600,
  diasMes: 30,
  diaActual: 22,
  horaActual: 14,
  minActual: 20,
  gastoHoy: 12_400,
  proximoSueldoEnDias: 8,
  dias: [
    26400, 30900, 15000, 42100, 28400, 31500, 18900,
    22400, 29800, 35600, 14000, 27800, 31200, 19500,
    24300, 33900, 41200, 28100, 22700, 37400, 29800,
  ],
  diasDow: [1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0],
  fijosCobertura: 17,
  diasSinGastar: [3, 11, 18],
  metaNoSpendSemana: 3,
  logrosNoSpendSemana: 2,
  mesPasado: {
    nombre: 'Marzo',
    gastoTotal: 1_687_000,
    diasBajoCupo: 15,
    promedioDiario: 56_233,
    topCat: {
      label: 'Ocio',
      categoryId: null,
      amount: 142_000,
      pct: 8.4,
    },
    mood: 'yellow',
    savingsDelta: 220_000,
    // @i18n-ignore (dev fixture)
    topExpense: { description: 'Cena cumpleaños', price: 38_500 },
    currentTopCatSpent: 92_400,
    trend: [1_540_000, 1_687_000, 1_240_000],
    cycleRangeLabel: null,
    categoryBreakdown: [
      { category_id: null, name: 'Mercado', color: '#2E7D5B', total: 540_000, count: 28, pct: 32 },
      { category_id: null, name: 'Restaurantes', color: '#A04040', total: 405_000, count: 11, pct: 24 },
      { category_id: null, name: 'Ocio', color: '#6B3A4F', total: 270_000, count: 6, pct: 16 },
      { category_id: null, name: 'Transporte', color: '#C9A23A', total: 202_000, count: 9, pct: 12 },
      { category_id: null, name: 'Otros', color: '#8A8A8A', total: 270_000, count: 8, pct: 16 },
    ],
    byMember: [
      { user_id: null, display_name: 'Tú', total: 1_120_000, count: 40 },
      { user_id: null, display_name: 'Compa', total: 567_000, count: 22 },
    ],
    dailyTotals: [
      42_000, 18_000, 55_000, 12_000, 0, 38_000, 61_000,
      24_000, 33_000, 0, 47_000, 29_000, 71_000, 15_000,
      52_000, 19_000, 0, 44_000, 38_000, 26_000, 58_000,
      31_000, 22_000, 49_000, 0, 17_000, 63_000, 35_000,
    ],
  },
  hasPreviousMonth: true,
  tareas: [
    {
      id: 't1',
      emoji: '🎬',
      cat: 'Ocio',
      // @i18n-ignore (dev fixture)
      title: 'Baja un poco el Ocio esta semana',
      body: 'Ya gastaste $28.400 en ocio. Te pusiste un tope de $20.000.',
      impact: '+$8.400 por mes',
      impactRaw: 8_400,
      cta: 'Ver gastos',
      urgency: 'media',
      confidence: 0.85,
      dataDays: 21,
    },
    {
      id: 't2',
      emoji: '🧟',
      cat: 'Suscripciones',
      title: 'Disney+ lleva 2 meses sin usar',
      body: 'Pagas $4.200 cada mes. Si lo cancelas, te ahorras $50.400 al año.',
      impact: '+$4.200 por mes',
      impactRaw: 4_200,
      cta: 'Cancelar',
      urgency: 'alta',
      confidence: 1.0,
      dataDays: 21,
    },
    {
      id: 't3',
      emoji: '⚡',
      cat: 'Servicios',
      // @i18n-ignore (dev fixture)
      title: 'La luz subió 14%',
      body: 'Edenor pasó de $28.000 a $32.500. Hay planes más baratos.',
      impact: '−$3.200 por mes',
      impactRaw: 3_200,
      cta: 'Comparar',
      urgency: 'baja',
      confidence: 1.0,
      dataDays: 21,
    },
  ],
}

export interface DayDetail {
  dia: number
  gasto: number
  delta: number
  dow: number
  inProgress?: boolean
}

export interface DowBucket {
  name: string
  avg: number
  count: number
  ratio: number
}

export interface ControlView {
  /** Whether today's current spend is within the proportional budget. */
  estaOk: boolean
  /** Remaining budget for today (can be negative). */
  libreHoy: number
  /** Budget that "should" have been spent by the current hour. */
  cupoHastaAhora: number
  /** cupoHastaAhora - gastoHoy (positive = ahead, negative = overspent). */
  delta: number
  /** Fractional hour of the day (0..24). */
  horaF: number
  /** Money saved vs `cupoDiario` across all past days. */
  vault: number
  /** Days that closed at or under cupo. */
  diasGanadores: number
  diasPerdedores: number
  promedioDiario: number
  /** Consecutive winning days ending on yesterday. */
  racha: number
  mejor: DayDetail
  peor: DayDetail
  detalleDias: DayDetail[]
  /** Projected day-of-month when the money runs out at current pace.
   *  If `alreadyExhausted` is true, this is an approximation of the
   *  day the budget was blown through (in the past). */
  diaAgotamiento: number
  /** True if the projection exceeds month length. */
  alcanzaElMes: boolean
  /** True when cumulative discretionary spend already exceeds the full
   *  month's discretionary budget — i.e. the user is past-the-fold and
   *  no forward projection makes sense. */
  alreadyExhausted: boolean
  /** Closed days of discretionary history used to build the average
   *  (excludes today). The projection card shows a placeholder until
   *  this reaches the `hasReliableProjection` floor. */
  closedDays: number
  /** True when we have enough closed days (≥7) to trust the
   *  projection. Below that, the card should show a placeholder even
   *  if `diaActual` clears an older lower floor. */
  hasReliableProjection: boolean
  /** True when there is at least some real discretionary spend in the
   *  cycle (closed days OR today). Cards that analyze spending (semana /
   *  patrón / alcancía) gate on this so a new account that joined
   *  mid-cycle — many elapsed days, zero spend — shows a "sin gastos
   *  todavía" placeholder instead of $0 averages. */
  /** Días distintos con gasto (cerrados + hoy). Las tarjetas de
   *  ritmo/patrón/alcancía/alcanza piden un mínimo de estos para
   *  activarse (1 gasto no es un patrón ni un promedio). */
  diasConGasto: number
  gastoProyectadoMes: number
  /** Days excluded from the projection because their spend exceeded
   *  3× median (outliers). Null when the robust algorithm didn't run
   *  (early in cycle, no closed days, etc.). The UI surfaces this so
   *  the user knows the projection ignored their spike days. */
  outlierDaysExcluded: number | null
  /** Sum of the outlier-day spending. Pairs with `outlierDaysExcluded`
   *  for the "Días atípicos descartados" chip in the vs-mes card. */
  outlierDaysTotal: number | null
  sobrantePresupuestadoMes: number
  diasRestantes: number
  restanteMes: number
  porDowEnriched: DowBucket[]
  peorDow: DowBucket
  mejorDow: DowBucket
  globalAvg: number
  noSpendCount: number
  coberturaFijos: number
  diasLibres: number
  /** Ratio between last-7 average and previous-7 average (1 = flat). */
  momentum: number
  avgU7: number
  avgP7: number
  /** 0–100 composite health score. */
  score: number
  scoreLabel: string
  scoreToneLight: string
  scoreToneDark: string
  /** The last 7 days including today (today flagged inProgress). */
  last7: DayDetail[]
  mpTotal: number
  proyectadoMes: number
  vsMesDeltaPct: number
  vsMesAhorro: number
  vsMesDiasBajoCupo: number
  vsMesMejor: boolean
}

const DOW_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

export function computeControlView(d: ControlMockData): ControlView {
  // 0. SANITIZE INPUTS — the adapter already guards these, but
  // computeControlView is the single funnel for every numeric field on
  // ControlView, so we re-clamp the scalars it divides/multiplies with.
  // This is the last line of defence for the invariant "dato válido o
  // ausente, nunca errático": a non-finite scalar slipping in here would
  // poison cupoHastaAhora, libreMesTotal, the projection, and the score.
  const cupoDiario = nonNegFinite(d.cupoDiario) ?? 0
  const gastoHoy = nonNegFinite(d.gastoHoy) ?? 0
  const diasMes = Math.max(1, finiteOr(d.diasMes, 30))
  const diaActual = clampFinite(d.diaActual, 1, diasMes)
  const ingresoMes = nonNegFinite(d.ingresoMes) ?? 0
  const fijosMes = nonNegFinite(d.fijosMes) ?? 0

  // 1. HOY
  // Clamp hora/min to their valid ranges so a bad clock value can't drive
  // horaF out of [0,24] and skew the proportional cupoHastaAhora.
  const horaF = clampFinite(d.horaActual, 0, 23) + clampFinite(d.minActual, 0, 59) / 60
  const libreHoy = cupoDiario - gastoHoy
  const cupoHastaAhora = (horaF / 24) * cupoDiario
  const delta = cupoHastaAhora - gastoHoy
  const estaOk = delta >= 0

  // 2. VAULT + derived per-day details
  // Guard: coerce each per-day spend to a finite non-negative number so a
  // single corrupt entry in d.dias can't poison the vault sum, the
  // average, the projection, or any per-day delta. A null/NaN day is
  // treated as a $0 day (absent, never erratic).
  const detalleDias: DayDetail[] = d.dias.map((g, i) => {
    const gasto = nonNegFinite(g) ?? 0
    return {
      dia: i + 1,
      gasto,
      delta: cupoDiario - gasto,
      dow: d.diasDow[i] ?? 0,
    }
  })
  // Suma cruda de los deltas positivos diarios (días que sub-gastaste el
  // cupo). OJO: ignora los días que te pasaste, así que con gasto lumpy
  // (mucho en pocos días) puede inflarse muy por encima del dinero real
  // que te queda. Se capea abajo contra `restanteMes`.
  const vaultRaw = detalleDias.reduce((s, x) => s + Math.max(0, x.delta), 0)
  const diasGanadores = detalleDias.filter((x) => x.gasto <= cupoDiario).length
  // Distinct days WITH spend (closed days that registered a gasto, plus
  // today if it has one). Drives the data-sufficiency gate of the cards
  // que muestran promedios/patrones: con 1 solo gasto no hay "ritmo
  // semanal" ni "patrón" real, así que esas tarjetas piden gasto en
  // varios días distintos antes de activarse.
  const diasConGasto =
    detalleDias.filter((x) => x.gasto > 0).length + (gastoHoy > 0 ? 1 : 0)
  const diasPerdedores = detalleDias.length - diasGanadores
  const gastoTotalMes = detalleDias.reduce((s, x) => s + x.gasto, 0)

  // Robust daily average — drops outlier days (gasto > 3× median) so
  // a single $885k Mercado run doesn't extrapolate to "$8M cycle pace"
  // when the other 11 days were ~$150k. The user still sees the
  // outliers in the recap chip, but the projection rhythm follows the
  // calm days. Falls back to plain mean when N < 5 closed days.
  const robustAverage = computeRobustDailyAverage(
    detalleDias.map((dd) => dd.gasto),
  )
  // Guard: the robust average feeds the projection (duracionAlRitmo,
  // gastoProyectadoMes) and the DOW ratios. Clamp it finite ≥0 so a
  // degenerate typicalAverage can never extrapolate to NaN/Infinity.
  const promedioDiario = nonNegFinite(robustAverage.typicalAverage) ?? 0

  let racha = 0
  for (let i = detalleDias.length - 1; i >= 0; i--) {
    if ((detalleDias[i]?.gasto ?? 0) <= cupoDiario) racha++
    else break
  }

  const mejor = detalleDias.reduce(
    (a, b) => (b.gasto < a.gasto ? b : a),
    detalleDias[0] ?? { dia: 0, gasto: 0, delta: 0, dow: 0 },
  )
  const peor = detalleDias.reduce(
    (a, b) => (b.gasto > a.gasto ? b : a),
    detalleDias[0] ?? { dia: 0, gasto: 0, delta: 0, dow: 0 },
  )

  // 3. PROJECTION — when does the discretionary budget run out?
  //
  // Inputs (what we compare against):
  //   · budget   = libreMes (ingresoMes − fijosMes) spread across cycleDays
  //   · spent    = Σ discretionary spend this cycle (fixed-expense
  //                payments excluded by the adapter via !commitment_id)
  //   · pace     = avg daily discretionary spend from CLOSED days only
  //                (today is partial and would distort the rate)
  //
  // The floor for a meaningful projection is 7 CLOSED days — that
  // guarantees one full week with both weekday and weekend samples.
  // Below that, `hasReliableProjection = false` and the UI renders
  // a placeholder instead.
  const gastadoHastaHoy = gastoTotalMes + gastoHoy
  // Presupuesto discrecional total del ciclo = libreMes (ingreso − fijos −
  // ahorro). Antes se reconstruía como `cupoDiario × diasMes`, que asumía
  // cupoDiario = libreMes/díasTOTALES. Con override el cupoDiario es por día
  // RESTANTE y ya resta el variable, así que esa reconstrucción inflaba
  // restanteMes/sobrante. Usar libreMes directo deja el no-override idéntico
  // (ahí libreMes == cupoDiario × diasMes) y corrige el override → restanteMes
  // = libreMes − gastado = el saldo real (coincide con el Home).
  const libreMesTotal = nonNegFinite(d.libreMes) ?? cupoDiario * diasMes
  const restanteMes = libreMesTotal - gastadoHastaHoy
  // La alcancía es una SUGERENCIA de cuánto mover a tu meta — nunca puede
  // superar lo que realmente te queda. Sin el cap mostraba "2.5M guardados"
  // mientras el saldo real era 139K (gasto lumpy: sub-gastaste muchos días
  // pero te pasaste en pocos, y el raw ignora los días que te pasaste).
  const vault = Math.min(vaultRaw, Math.max(0, restanteMes))
  const diasRestantes = diasMes - diaActual + 1
  const closedDays = detalleDias.length
  // Una proyección confiable necesita DOS cosas: una semana de días
  // cerrados Y gasto discrecional real para promediar. `closedDays`
  // cuenta días-calendario del ciclo transcurridos (detalleDias mapea
  // d.dias), así que una cuenta nueva que entra a mitad/fin de ciclo
  // tendría closedDays>=7 con `promedioDiario=0` → antes mostraba
  // "alcanza con margen de sobra" proyectando desde $0/día (engañoso).
  // Exigiendo `promedioDiario > 0`, la AlcanzaCard cae a su placeholder
  // ("necesitamos una semana de gastos") hasta que haya datos reales.
  const noDiscretionarySpendYet = promedioDiario <= 0 && gastoHoy <= 0
  // Proyección confiable: una semana de días cerrados Y gasto real en al
  // menos 7 días distintos (no alcanza con 1 día con gasto promediado
  // sobre la semana). diasConGasto>=7 con closedDays>=7 garantiza
  // promedioDiario>0.
  const hasReliableProjection = closedDays >= 7 && diasConGasto >= 7
  const alreadyExhausted =
    hasReliableProjection &&
    gastadoHastaHoy > libreMesTotal &&
    promedioDiario > 0
  // Guard: safeDiv over the daily pace. promedioDiario is already gated
  // >0, but safeDiv also rejects a non-finite restanteMes; finiteOr→0
  // keeps duracionAlRitmo (and the diaAgotamientoFloat below) finite so
  // the runout day can never become Infinity/NaN.
  const duracionAlRitmo =
    promedioDiario > 0 ? finiteOr(safeDiv(restanteMes, promedioDiario) ?? 0, 0) : 0
  const diaAgotamientoFloat = diaActual + duracionAlRitmo
  let diaAgotamiento: number
  if (alreadyExhausted) {
    // Approximate day-of-cycle when cumulative spend crossed the
    // discretionary budget. Backtrack from today by the overshoot at
    // the current pace. Guard: safeDiv (promedioDiario>0 is asserted by
    // alreadyExhausted) + finiteOr→0 so overshootDays is never NaN.
    const overshootDays = Math.ceil(
      finiteOr(safeDiv(gastadoHastaHoy - libreMesTotal, promedioDiario) ?? 0, 0),
    )
    diaAgotamiento = Math.max(
      1,
      Math.min(diasMes, Math.floor(diaActual - overshootDays)),
    )
  } else if (!hasReliableProjection || promedioDiario <= 0) {
    // Not enough data yet, OR no discretionary spend at all → the UI
    // treats both cases as "budget would last forever" so the
    // already-exhausted / runout branches never fire.
    diaAgotamiento = diasMes + 1
  } else {
    diaAgotamiento = Math.min(
      diasMes + 1,
      Math.max(1, Math.floor(diaAgotamientoFloat)),
    )
  }
  // Card is "green / alcanza" when the projected run-out lands past
  // the cycle end OR when there's simply no discretionary spend yet.
  const alcanzaElMes =
    !alreadyExhausted &&
    (noDiscretionarySpendYet || diaAgotamiento > diasMes)
  // Proyección de cierre HONESTA (auditoría 2026-06-11): lo YA gastado
  // es un hecho, no una proyección — solo los días que faltan se
  // extrapolan al ritmo típico. La versión anterior proyectaba el MES
  // ENTERO al promedio robusto (que además excluye los días pico), así
  // que con $4.3M ya gastados la card podía anunciar "sobran $2.1M"
  // cuando el disponible real era ~$0. Caso real de la cuenta owner.
  const diasFuturos = Math.max(0, diasMes - diaActual)
  // Guard: promedioDiario is sanitized at extraction (finite ≥0) so this
  // projection and the sobrante derived from it are always finite.
  const gastoProyectadoMes = gastadoHastaHoy + promedioDiario * diasFuturos
  const sobrantePresupuestadoMes = libreMesTotal - gastoProyectadoMes

  // 4. DOW pattern
  const porDow = DOW_NAMES.map((name, i) => {
    const dias = detalleDias.filter((x) => x.dow === i)
    const total = dias.reduce((s, x) => s + x.gasto, 0)
    // safeDiv→finiteOr keep the per-DOW average finite for every bucket.
    const avg = dias.length ? finiteOr(safeDiv(total, dias.length) ?? 0, 0) : 0
    return { name, avg, count: dias.length }
  })
  const globalAvg = promedioDiario
  const porDowEnriched: DowBucket[] = porDow.map((x) => ({
    ...x,
    // ratio gated globalAvg>0; safeDiv→finiteOr→0 on any residual.
    ratio: globalAvg > 0 ? finiteOr(safeDiv(x.avg, globalAvg) ?? 0, 0) : 0,
  }))
  const peorDow = porDowEnriched.reduce(
    (a, b) => (b.avg > a.avg ? b : a),
    porDowEnriched[0]!,
  )
  const withSpend = porDowEnriched.filter((x) => x.avg > 0)
  const mejorDow =
    withSpend.length > 0
      ? withSpend.reduce((a, b) => (b.avg < a.avg ? b : a))
      : porDowEnriched[0]!

  // 5. NO-SPEND
  const noSpendCount = d.diasSinGastar.length

  // 6. FIXED COVERAGE
  // Guard ingresoMes > 0 so a synthetic scenario with zero income
  // (or a real user that hasn't filled it in) doesn't propagate
  // Infinity into `coberturaFijos` and downstream `fijosRatio`/score.
  // safeDiv + finiteOr keep coberturaFijos a finite integer even if an
  // upstream value sneaks past the >0 gate.
  const coberturaFijos =
    ingresoMes > 0
      ? Math.ceil(finiteOr((safeDiv(fijosMes, ingresoMes) ?? 0) * diasMes, 0))
      : 0
  const diasLibres = diasMes - coberturaFijos

  // 7. MOMENTUM
  const ultimos7 = detalleDias.slice(-7)
  const previos7 = detalleDias.slice(-14, -7)
  // avg over a known-nonempty slice of finite gastos → finite. safeDiv is
  // belt-and-suspenders against a 0/non-finite length.
  const avgU7 =
    ultimos7.length > 0
      ? finiteOr(safeDiv(ultimos7.reduce((s, x) => s + x.gasto, 0), ultimos7.length) ?? 0, 0)
      : 0
  const avgP7 =
    previos7.length > 0
      ? finiteOr(safeDiv(previos7.reduce((s, x) => s + x.gasto, 0), previos7.length) ?? 0, 0)
      : avgU7
  // momentum gated avgP7>0; safeDiv→finiteOr→1 (flat) on any residual.
  const momentum = avgP7 > 0 ? finiteOr(safeDiv(avgU7, avgP7) ?? 1, 1) : 1

  // 8. SCORE (weighted composite)
  // safeDiv→finiteOr keep the win-rate term finite even if detalleDias
  // length is degenerate.
  const sBajoCupo =
    detalleDias.length > 0
      ? finiteOr(safeDiv(diasGanadores, detalleDias.length) ?? 0, 0) * 40
      : 0
  const sRacha = (Math.min(racha, 7) / 7) * 20
  const sMomentum = momentum <= 1 ? 20 : Math.max(0, 20 - (momentum - 1) * 40)
  const sNoSpend = (Math.min(noSpendCount, 5) / 5) * 10
  // ingresoMes=0 → fijosRatio=NaN → sFijos=NaN → score=NaN. Default
  // ratio to 0 when there's no income so the score stays a number.
  // safeDiv→finiteOr is the explicit form of that guard.
  const fijosRatio = ingresoMes > 0 ? finiteOr(safeDiv(fijosMes, ingresoMes) ?? 0, 0) : 0
  // Clamp a 10 (auditoría 2026-06-11): sin el tope, un fijosRatio bajo
  // aportaba hasta 20/10 puntos y el score total podía superar 100,
  // inflando el label ("Excelente" regalado).
  const sFijos = Math.min(10, Math.max(0, (1 - fijosRatio) / 0.5) * 10)
  // Guard: clamp the final composite to [0,100] and floor non-finite to 0
  // so score / scoreLabel / scoreTone never derive from a NaN.
  const score = clampFinite(
    Math.round(sBajoCupo + sRacha + sMomentum + sNoSpend + sFijos),
    0,
    100,
  )
  const scoreLabel =
    score >= 80
      ? 'Excelente'
      : score >= 65
        ? 'Muy bien'
        : score >= 50
          ? 'Bien'
          : score >= 35
            ? 'Regular'
            : 'Atención'
  const scoreToneLight =
    score >= 65 ? '#2E7D5B' : score >= 50 ? '#C9A23A' : '#D96A4F'
  const scoreToneDark =
    score >= 65 ? '#9EE0B2' : score >= 50 ? '#F1D690' : '#E88A70'

  // 9. LAST 7 including today (for the weekly rhythm bars). Uses the
  // sanitized scalars so today's in-progress bar is always finite.
  const last7: DayDetail[] = detalleDias.slice(-6).map((x) => ({ ...x }))
  last7.push({
    dia: diaActual,
    gasto: gastoHoy,
    delta: cupoDiario - gastoHoy,
    dow: 0,
    inProgress: true,
  })

  // 10. VS PREVIOUS MONTH
  // Clamp the delta % to ±999 so a tiny prior cycle ($1k) projecting to
  // a normal one ($50k) doesn't render "+4900% vs mes pasado", which
  // is technically true but useless to the user. Anything ≥1000% gets
  // capped — the signed value still communicates direction + extremity.
  // Guard: prev-month total clamped finite ≥0 so a corrupt fixture / DB
  // value can't make mpTotal NaN and poison every vs-mes field below.
  const mpTotal = nonNegFinite(d.mesPasado.gastoTotal) ?? 0
  const proyectadoMes = gastoProyectadoMes
  // safeDiv guards the % (mpTotal already gated >0); finiteOr→0 keeps
  // rawDeltaPct finite before the ±999 clamp.
  const rawDeltaPct =
    mpTotal > 0 ? finiteOr((safeDiv(proyectadoMes - mpTotal, mpTotal) ?? 0) * 100, 0) : 0
  const vsMesDeltaPct = clampFinite(rawDeltaPct, -999, 999)
  const vsMesAhorro = mpTotal - proyectadoMes
  // Guard: prev-month day count clamped finite so the diff is never NaN.
  const vsMesDiasBajoCupo = diasGanadores - (nonNegFinite(d.mesPasado.diasBajoCupo) ?? 0)
  const vsMesMejor = proyectadoMes < mpTotal

  return {
    estaOk,
    libreHoy,
    cupoHastaAhora,
    delta,
    horaF,
    vault,
    diasGanadores,
    diasPerdedores,
    promedioDiario,
    racha,
    mejor,
    peor,
    detalleDias,
    diaAgotamiento,
    alcanzaElMes,
    alreadyExhausted,
    closedDays,
    hasReliableProjection,
    diasConGasto,
    gastoProyectadoMes,
    outlierDaysExcluded: robustAverage.hadEnoughData
      ? robustAverage.outlierDaysExcluded
      : null,
    outlierDaysTotal: robustAverage.hadEnoughData && robustAverage.outlierDaysExcluded > 0
      ? robustAverage.outlierDaysTotal
      : null,
    sobrantePresupuestadoMes,
    diasRestantes,
    restanteMes,
    porDowEnriched,
    peorDow,
    mejorDow,
    globalAvg,
    noSpendCount,
    coberturaFijos,
    diasLibres,
    momentum,
    avgU7,
    avgP7,
    score,
    scoreLabel,
    scoreToneLight,
    scoreToneDark,
    last7,
    mpTotal,
    proyectadoMes,
    vsMesDeltaPct,
    vsMesAhorro,
    vsMesDiasBajoCupo,
    vsMesMejor,
  }
}
