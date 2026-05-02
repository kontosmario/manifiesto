// Control v2 — mock dataset and pure math layer.
//
// PHASE 1 (now): this file hard-codes a realistic dataset + a single
// `computeControlView` function so we can build the UI without waiting
// for backend wiring. Every number in the mock has a clear meaning —
// income, fixed, month length, current day/time, daily spend history —
// so when we connect real data in PHASE 2 we swap the `CONTROL_MOCK`
// source and keep every visualization intact.
//
// PHASE 2 plan: replace `CONTROL_MOCK` with the output of
// `useControlSnapshot(familyId)` + historical expenses query. The
// shape of `ControlView` is the contract the UI will consume.

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
  }
  /** True only when there's at least one fully-closed previous cycle
   *  with real discretionary spend — the "Vs mes pasado" card stays
   *  hidden / shows a placeholder otherwise. */
  hasPreviousMonth: boolean
  tareas: ControlAdvisorTask[]
}

import type { ControlAction } from '@/features/insights/control-action'

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
    topExpense: { description: 'Cena cumpleaños', price: 38_500 },
    currentTopCatSpent: 92_400,
    trend: [1_540_000, 1_687_000, 1_240_000],
    cycleRangeLabel: null,
  },
  hasPreviousMonth: true,
  tareas: [
    {
      id: 't1',
      emoji: '🎬',
      cat: 'Ocio',
      title: 'Bajá un poco el Ocio esta semana',
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
      body: 'Pagás $4.200 cada mes. Si lo cancelás, te ahorrás $50.400 al año.',
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
  gastoProyectadoMes: number
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
  // 1. HOY
  const horaF = d.horaActual + d.minActual / 60
  const libreHoy = d.cupoDiario - d.gastoHoy
  const cupoHastaAhora = (horaF / 24) * d.cupoDiario
  const delta = cupoHastaAhora - d.gastoHoy
  const estaOk = delta >= 0

  // 2. VAULT + derived per-day details
  const detalleDias: DayDetail[] = d.dias.map((g, i) => ({
    dia: i + 1,
    gasto: g,
    delta: d.cupoDiario - g,
    dow: d.diasDow[i] ?? 0,
  }))
  const vault = detalleDias.reduce((s, x) => s + Math.max(0, x.delta), 0)
  const diasGanadores = detalleDias.filter((x) => x.gasto <= d.cupoDiario).length
  const diasPerdedores = detalleDias.length - diasGanadores
  const gastoTotalMes = detalleDias.reduce((s, x) => s + x.gasto, 0)
  const promedioDiario =
    detalleDias.length > 0 ? gastoTotalMes / detalleDias.length : 0

  let racha = 0
  for (let i = detalleDias.length - 1; i >= 0; i--) {
    if ((detalleDias[i]?.gasto ?? 0) <= d.cupoDiario) racha++
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
  const gastadoHastaHoy = gastoTotalMes + d.gastoHoy
  const libreMesTotal = d.cupoDiario * d.diasMes
  const restanteMes = libreMesTotal - gastadoHastaHoy
  const diasRestantes = d.diasMes - d.diaActual + 1
  const closedDays = detalleDias.length
  const hasReliableProjection = closedDays >= 7
  const noDiscretionarySpendYet =
    hasReliableProjection && promedioDiario <= 0 && d.gastoHoy <= 0
  const alreadyExhausted =
    hasReliableProjection &&
    gastadoHastaHoy > libreMesTotal &&
    promedioDiario > 0
  const duracionAlRitmo = promedioDiario > 0 ? restanteMes / promedioDiario : 0
  const diaAgotamientoFloat = d.diaActual + duracionAlRitmo
  let diaAgotamiento: number
  if (alreadyExhausted) {
    // Approximate day-of-cycle when cumulative spend crossed the
    // discretionary budget. Backtrack from today by the overshoot at
    // the current pace.
    const overshootDays = Math.ceil(
      (gastadoHastaHoy - libreMesTotal) / promedioDiario,
    )
    diaAgotamiento = Math.max(
      1,
      Math.min(d.diasMes, Math.floor(d.diaActual - overshootDays)),
    )
  } else if (!hasReliableProjection || promedioDiario <= 0) {
    // Not enough data yet, OR no discretionary spend at all → the UI
    // treats both cases as "budget would last forever" so the
    // already-exhausted / runout branches never fire.
    diaAgotamiento = d.diasMes + 1
  } else {
    diaAgotamiento = Math.min(
      d.diasMes + 1,
      Math.max(1, Math.floor(diaAgotamientoFloat)),
    )
  }
  // Card is "green / alcanza" when the projected run-out lands past
  // the cycle end OR when there's simply no discretionary spend yet.
  const alcanzaElMes =
    !alreadyExhausted &&
    (noDiscretionarySpendYet || diaAgotamiento > d.diasMes)
  const gastoProyectadoMes = promedioDiario * d.diasMes
  const sobrantePresupuestadoMes = libreMesTotal - gastoProyectadoMes

  // 4. DOW pattern
  const porDow = DOW_NAMES.map((name, i) => {
    const dias = detalleDias.filter((x) => x.dow === i)
    const total = dias.reduce((s, x) => s + x.gasto, 0)
    const avg = dias.length ? total / dias.length : 0
    return { name, avg, count: dias.length }
  })
  const globalAvg = promedioDiario
  const porDowEnriched: DowBucket[] = porDow.map((x) => ({
    ...x,
    ratio: globalAvg > 0 ? x.avg / globalAvg : 0,
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
  const coberturaFijos =
    d.ingresoMes > 0
      ? Math.ceil((d.fijosMes / d.ingresoMes) * d.diasMes)
      : 0
  const diasLibres = d.diasMes - coberturaFijos

  // 7. MOMENTUM
  const ultimos7 = detalleDias.slice(-7)
  const previos7 = detalleDias.slice(-14, -7)
  const avgU7 =
    ultimos7.length > 0
      ? ultimos7.reduce((s, x) => s + x.gasto, 0) / ultimos7.length
      : 0
  const avgP7 =
    previos7.length > 0
      ? previos7.reduce((s, x) => s + x.gasto, 0) / previos7.length
      : avgU7
  const momentum = avgP7 > 0 ? avgU7 / avgP7 : 1

  // 8. SCORE (weighted composite)
  const sBajoCupo =
    detalleDias.length > 0 ? (diasGanadores / detalleDias.length) * 40 : 0
  const sRacha = (Math.min(racha, 7) / 7) * 20
  const sMomentum = momentum <= 1 ? 20 : Math.max(0, 20 - (momentum - 1) * 40)
  const sNoSpend = (Math.min(noSpendCount, 5) / 5) * 10
  // ingresoMes=0 → fijosRatio=NaN → sFijos=NaN → score=NaN. Default
  // ratio to 0 when there's no income so the score stays a number.
  const fijosRatio = d.ingresoMes > 0 ? d.fijosMes / d.ingresoMes : 0
  const sFijos = Math.max(0, (1 - fijosRatio) / 0.5) * 10
  const score = Math.round(sBajoCupo + sRacha + sMomentum + sNoSpend + sFijos)
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

  // 9. LAST 7 including today (for the weekly rhythm bars)
  const last7: DayDetail[] = detalleDias.slice(-6).map((x) => ({ ...x }))
  last7.push({
    dia: d.diaActual,
    gasto: d.gastoHoy,
    delta: d.cupoDiario - d.gastoHoy,
    dow: 0,
    inProgress: true,
  })

  // 10. VS PREVIOUS MONTH
  // Clamp the delta % to ±999 so a tiny prior cycle ($1k) projecting to
  // a normal one ($50k) doesn't render "+4900% vs mes pasado", which
  // is technically true but useless to the user. Anything ≥1000% gets
  // capped — the signed value still communicates direction + extremity.
  const mpTotal = d.mesPasado.gastoTotal
  const proyectadoMes = gastoProyectadoMes
  const rawDeltaPct =
    mpTotal > 0 ? ((proyectadoMes - mpTotal) / mpTotal) * 100 : 0
  const vsMesDeltaPct = Math.max(-999, Math.min(999, rawDeltaPct))
  const vsMesAhorro = mpTotal - proyectadoMes
  const vsMesDiasBajoCupo = diasGanadores - d.mesPasado.diasBajoCupo
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
    gastoProyectadoMes,
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
