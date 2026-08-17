/**
 * Módulo PURO de derivación para `NeoControlScreen` (vista Control del
 * rediseño, design_handoff_control). Selección de variante por
 * componente + construcción de los overrides `Partial<*Content>` que
 * consume el kit (`components/redesign/control/`), a partir del
 * `ControlView`/`ControlMockData` que ya produce `computeControlView`
 * (embudo único de todo número de Control — acá NO se recalcula nada
 * que el view ya tenga; solo se formatea y se eligen estados).
 *
 * Cero imports de runtime de React/RN — todo lo que viene del kit entra
 * con `import type` (mismo criterio que `neo-fijos-view-model.ts`: un
 * import de VALOR arrastraría react-native-svg/Skia y rompería la suite
 * de vitest en env node).
 *
 * Umbrales de estado (los que el handoff no define numéricamente — el
 * markup es una foto, no una spec de rangos):
 *  · Hero `ajustado`: sobrante proyectado < 1.5 × cupoDiario (menos de
 *    un día y medio de cupo de margen ≈ el "+$180k con cupo $135k" del
 *    estado HC-B del handoff).
 *  · Comparativa `igual`: |ahorro vs mes pasado| ≤ 5% del total del mes
 *    pasado (el "≈ $6,6M / $0,1M por debajo" de CV-C es ~1.5%).
 *  · Tendencia `alza`/`descendente`: momentum ≥ 1.15 / ≤ 0.85 (mismo
 *    umbral de la ControlV2SemanaCard vieja para "subiendo/bajando").
 *  · Patrón `pico`: peor ratio ≥ 1.5× · `findes`: Sáb y Dom ambos sobre
 *    el promedio y el peor es finde.
 *  · Reparto `fijosAltos`: fijos ≥ 35% del ingreso (el SD-B del handoff
 *    dibuja 42% con copy "más de un tercio").
 */
import i18n from '@/lib/i18n'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import type {
  ControlMockData,
  ControlView,
  DayDetail,
} from '@/features/insights/control-v2-mock'
import type { BrotPose } from '@/components/brot/brot-mascot'
import type {
  ControlHeroVariant,
  ControlHeroContent,
  ControlComparativaVariant,
  ControlComparativaContent,
  ControlTendenciaVariant,
  ControlTendenciaContent,
  ControlTendenciaBar,
  ControlTendenciaInsightSegment,
  ControlPatronVariant,
  ControlPatronContent,
  ControlPatronRow,
  ControlPatronSegment,
  ControlRepartoVariant,
  ControlRepartoContent,
  RepartoTextSegment,
  ControlAlcanciaVariant,
  ControlAlcanciaContent,
  ControlIngresosVariant,
  ControlIngresosContent,
  IngresosRow,
  IngresosTextSegment,
  ControlReservaVariant,
  ControlReservaContent,
} from '@/components/redesign/control/control-screen'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import type { IngresosCiclo } from '@/features/insights/use-control-v2-data'

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

/** "−$2,7M" — signo MENOS unicode (U+2212, como dibuja el handoff), no el
 *  hyphen ASCII que emite `formatMoneyShort` para negativos. */
function minusShort(n: number): string {
  return `−${formatMoneyShort(Math.abs(n))}`
}

function plusShort(n: number): string {
  return `+${formatMoneyShort(Math.abs(n))}`
}

/** "20 jun → 19 jul" — rango del ciclo para el trigger del header. Mismo
 *  formato day+month-short lowercase del handoff. Requiere fechas ancladas
 *  a medianoche local (ver precondición en neo-fijos-view-model). */
export function formatCycleRange(start: Date, end: Date): string {
  const fmt = getDateTimeFormat({ day: 'numeric', month: 'short' })
  const clean = (d: Date) => fmt.format(d).replace(/\.$/, '').replace(/\./g, '')
  return `${clean(start)} → ${clean(end)}`
}

/** Índice 0=Lun..6=Dom (convención de `diasDow`/`porDowEnriched`) → nombre
 *  completo capitalizado ("Miércoles"). Reusa `control:header.weekdays`
 *  (claves por día JS 0=Dom, en MAYÚSCULAS). */
export function dayNameFromDowIndex(dowMonday0: number): string {
  const jsDay = (dowMonday0 + 1) % 7
  const upper = i18n.t(`control:header.weekdays.${jsDay}`)
  return upper.charAt(0) + upper.slice(1).toLowerCase()
}

/** Inicial del día para el eje del gráfico de 7 días (L M X J V S D). */
function dayInitialFromDowIndex(dowMonday0: number): string {
  return i18n.t(`control:weekdayInitials.${((dowMonday0 % 7) + 7) % 7}`)
}

/** `['Miércoles','Sábado'] → 'Miércoles y Sábado'` (sin coma de Oxford).
 *  La conjunción sale de i18n (" y " / " and "), patrón `joinNamesEs` de
 *  neo-fijos-view-model. */
function joinDays(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  const and = i18n.t('control:neo.patron.daysJoin')
  return `${names.slice(0, -1).join(', ')}${and}${names[names.length - 1]}`
}

/**
 * Glyph de texto del "emoji" de la meta — réplica PURA de
 * `goalEmojiText` (`features/savings-goals/goal-icon.ts`) sin importar
 * el registry de stickers: ese módulo hace `require()` de 90 PNG y
 * revienta la suite de vitest (env node, sin loader de assets) — misma
 * clase de import-trap que react-native-svg (ver docblock del módulo).
 * El discriminador es el formato "<scope>/<slug>" que el propio
 * goal-icon documenta como libre de colisiones con emojis.
 */
function goalEmojiGlyph(value: string | null | undefined): string {
  if (!value) return ''
  return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(value) ? '' : value
}

/** Pose del Brot del header — reacciona al score (el handoff dibuja `cool`
 *  con 94; los cortes siguen los de `scoreLabel` en control-v2-mock). */
export function headerBrotPose(score: number, hasData: boolean): BrotPose {
  if (!hasData) return 'wave'
  if (score >= 80) return 'cool'
  if (score >= 65) return 'cheer'
  if (score >= 50) return 'think'
  if (score >= 35) return 'worried'
  return 'sad'
}

// ---------------------------------------------------------------------------
// ① Header
// ---------------------------------------------------------------------------

export interface HeaderVm {
  cycleLabel: string
  score: number
  /** '—' mientras el score no es computable (sin días con gasto). */
  scoreText: string | undefined
  scoreCaption: string
  brotPose: BrotPose
}

export function buildHeaderVm(input: {
  cycleStart: Date
  /** `monthlyAccounting.end` — EXCLUSIVO (primer día del ciclo
   *  siguiente); acá se muestra el último día inclusivo ("20 jun →
   *  19 jul"), restando un día calendario por componentes (inmune a
   *  DST, mismo criterio que previousCalendarDay de neo-fijos). */
  cycleEnd: Date
  diaActual: number
  score: number
  hasData: boolean
}): HeaderVm {
  const endInclusive = new Date(
    input.cycleEnd.getFullYear(),
    input.cycleEnd.getMonth(),
    input.cycleEnd.getDate() - 1,
  )
  const range = formatCycleRange(input.cycleStart, endInclusive)
  return {
    cycleLabel: i18n.t('control:neo.header.cycle', { range, day: input.diaActual }),
    score: input.hasData ? input.score : 0,
    scoreText: input.hasData ? undefined : i18n.t('control:neo.header.scorePending'),
    scoreCaption: i18n.t('control:neo.header.scoreCaption'),
    brotPose: headerBrotPose(input.score, input.hasData),
  }
}

// ---------------------------------------------------------------------------
// ② Hero — "Hasta cuándo te alcanza"
// ---------------------------------------------------------------------------

export function selectHeroVariant(input: {
  hasReliableProjection: boolean
  alreadyExhausted: boolean
  sobrante: number
  cupoDiario: number
}): ControlHeroVariant {
  if (!input.hasReliableProjection) return 'primerCiclo'
  if (input.alreadyExhausted || input.sobrante < 0) return 'corto'
  if (input.sobrante < input.cupoDiario * 1.5) return 'ajustado'
  return 'holgado'
}

export function buildHeroContent(input: {
  variant: ControlHeroVariant
  view: ControlView
  data: ControlMockData
}): Partial<ControlHeroContent> {
  const { variant, view, data } = input
  const t = i18n.t
  const sobrante = view.sobrantePresupuestadoMes
  const shared: Partial<ControlHeroContent> = {
    eyebrow: t('control:neo.hero.eyebrow'),
    todayPrefix: t('control:neo.hero.todayPrefix'),
    todayAmount: formatMoneyShort(Math.max(0, view.restanteMes)),
    stats: {
      ritmo: {
        label: t('control:neo.hero.ritmo'),
        value: formatMoneyShort(view.promedioDiario),
        sub: t('control:neo.hero.ritmoSub'),
      },
      cupo: {
        label: t('control:neo.hero.cupo'),
        value: formatMoneyShort(data.cupoDiario),
        sub: t('control:neo.hero.cupoSub'),
      },
      // Dinámico: no hay sueldo que "llegue" — QUEDAN cuenta días al
      // cierre del ciclo y el timeline termina en FIN DE CICLO.
      quedan: {
        label: t('control:neo.hero.quedan'),
        value: t('control:neo.hero.quedanValor', {
          count:
            data.incomeMode === 'dynamic' ? view.diasRestantes : data.proximoSueldoEnDias,
        }),
        sub:
          data.incomeMode === 'dynamic'
            ? t('control:neo.hero.quedanSubDynamic')
            : t('control:neo.hero.quedanSub'),
      },
    },
    progressPct: Math.max(
      0,
      Math.min(100, Math.round((data.diaActual / Math.max(1, data.diasMes)) * 100)),
    ),
    timelineLabels: {
      start: t('control:neo.hero.timelineInicio'),
      today: t('control:neo.hero.timelineHoy'),
      end:
        data.incomeMode === 'dynamic'
          ? t('control:neo.hero.timelineFinDynamic')
          : t('control:neo.hero.timelineSueldo'),
    },
  }

  switch (variant) {
    case 'holgado':
      return {
        ...shared,
        verdictLabel: t('control:neo.hero.verdictHolgado'),
        wellLabel: t('control:neo.hero.wellLabelSobra'),
        amount: plusShort(sobrante),
        amountChipLabel: t('control:neo.hero.chipAlDia', { day: data.diasMes }),
        amountChipDir: 'up',
        todayPhrase: t('control:neo.hero.phraseHolgado'),
        footerText: t('control:neo.hero.footerSobraPrefix'),
        footerStrong: formatMoneyShort(sobrante),
        footerSuffix: t('control:neo.hero.footerSobraSuffix'),
        ctaLabel: t('control:neo.hero.ctaHolgado'),
      }
    case 'ajustado':
      return {
        ...shared,
        verdictLabel: t('control:neo.hero.verdictAjustado'),
        wellLabel: t('control:neo.hero.wellLabelSobra'),
        amount: plusShort(sobrante),
        amountChipLabel: t('control:neo.hero.chipAlDia', { day: data.diasMes }),
        amountChipDir: 'up',
        todayPhrase: t('control:neo.hero.phraseAjustado'),
        footerText: t('control:neo.hero.footerAjustadoPrefix'),
        footerStrong: t('control:neo.hero.footerAjustadoStrong'),
        footerSuffix: '',
        ctaLabel: t('control:neo.hero.ctaAjustado'),
      }
    case 'corto':
      return {
        ...shared,
        verdictLabel: t('control:neo.hero.verdictCorto'),
        wellLabel: t('control:neo.hero.wellLabelCorto'),
        amount: formatMoneyShort(Math.abs(sobrante)),
        amountChipLabel: t('control:neo.hero.chipFaltante'),
        amountChipDir: 'down',
        todayPhrase: t('control:neo.hero.phraseCorto'),
        footerText: t('control:neo.hero.footerCortoPrefix'),
        footerStrong: formatMoneyShort(Math.abs(sobrante)),
        footerSuffix: t('control:neo.hero.footerCortoSuffix'),
        ctaLabel: t('control:neo.hero.ctaCorto'),
      }
    case 'primerCiclo': {
      // Dos sub-casos con la misma shape HC-D: primer ciclo REAL (copy
      // de bienvenida) vs arranque de un ciclo con historia — a un
      // veterano el copy "Todavía no sé si te alcanza" de primera vez
      // le mentiría cada día 1–6 de cada ciclo.
      const early = data.hasPreviousMonth
      return {
        eyebrow: t('control:neo.hero.eyebrow'),
        verdictLabel: t('control:neo.hero.verdictSinDatos'),
        emptyTitle: early ? t('control:neo.hero.earlyTitle') : t('control:neo.hero.emptyTitle'),
        emptyBody: early ? t('control:neo.hero.earlyBody') : t('control:neo.hero.emptyBody'),
        emptyPlaceholder: t('control:neo.hero.emptyPlaceholder'),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ③ Comparativa — "Cómo vas este mes"
// ---------------------------------------------------------------------------

export function selectComparativaVariant(input: {
  hasPreviousMonth: boolean
  mpTotal: number
  vsMesAhorro: number
  /** Sin proyección confiable (días 1–6 de CADA ciclo) la comparación
   *  proyectado-vs-mes-pasado declararía "GASTÁS MENOS" con $0 gastados
   *  — cae a la shape primerMes con copy "juntando datos". */
  hasReliableProjection: boolean
}): ControlComparativaVariant {
  if (!input.hasPreviousMonth || input.mpTotal <= 0) return 'primerMes'
  if (!input.hasReliableProjection) return 'primerMes'
  if (Math.abs(input.vsMesAhorro) <= input.mpTotal * 0.05) return 'igual'
  return input.vsMesAhorro > 0 ? 'menos' : 'mas'
}

export function buildComparativaContent(input: {
  variant: ControlComparativaVariant
  view: ControlView
  data: ControlMockData
  /** Sólo con wrapped disponible se muestra el CTA "Ver el cierre". */
  hasWrapped: boolean
}): Partial<ControlComparativaContent> {
  const { variant, view, data, hasWrapped } = input
  const t = i18n.t
  const month = data.mesPasado.nombre
  const proyectado = view.proyectadoMes
  const delta = view.vsMesAhorro
  const gastadoHastaHoy = Math.max(0, view.libreMesTotal - view.restanteMes)

  const outliers =
    view.outlierDaysExcluded != null && view.outlierDaysExcluded > 0
      ? {
          prefix: t('control:neo.comparativa.outliersPrefix'),
          count: String(view.outlierDaysExcluded),
          suffix: t('control:neo.comparativa.outliersSuffix', {
            amount: formatMoneyShort(view.outlierDaysTotal ?? 0),
          }),
        }
      : undefined

  const shared: Partial<ControlComparativaContent> = {
    title: t('control:neo.comparativa.title'),
    topCatPrefix: t('control:neo.comparativa.topCatPrefix'),
    topCatName: data.mesPasado.topCat.label,
    outliers,
    ctaLabel: hasWrapped
      ? t('control:neo.comparativa.ctaCierre', { month })
      : undefined,
  }

  if (variant === 'primerMes') {
    // Dos sub-casos con la misma shape: primer mes de verdad (no hay
    // mes anterior) vs arranque de un ciclo con historia (proyección
    // aún no confiable → "juntando datos").
    const early = data.hasPreviousMonth && view.mpTotal > 0
    return {
      title: t('control:neo.comparativa.title'),
      // "Primer mes" mentiría en el sub-caso early: ahí SÍ hay un mes
      // anterior (el copy del cuerpo lo nombra), lo que falta es ciclo
      // suficiente para proyectar.
      verdictLabel: early
        ? t('control:neo.comparativa.verdictPrimerosDias')
        : t('control:neo.comparativa.verdictPrimerMes'),
      emptyTitle: early
        ? t('control:neo.comparativa.earlyTitle')
        : t('control:neo.comparativa.primerMesTitle'),
      emptyBodyPrefix: early
        ? t('control:neo.comparativa.earlyBodyPrefix')
        : t('control:neo.comparativa.primerMesBodyPrefix'),
      emptyBodyBold: formatMoneyShort(gastadoHastaHoy),
      emptyBodySuffix: early
        ? t('control:neo.comparativa.earlyBodySuffix', { month })
        : t('control:neo.comparativa.primerMesBodySuffix'),
      emptyBarLabel: early
        ? t('control:neo.comparativa.earlyBar', { month })
        : t('control:neo.comparativa.primerMesBar'),
      topCatPrefix: t('control:neo.comparativa.topCatPrefix'),
      topCatName: data.mesPasado.topCat.label,
      outliers: undefined,
      // CV-D del handoff: CTA "▶ Ver mi mes en curso ›" — navega a la
      // tab de Gastos (lo cablea el screen vía onPressCierre).
      ctaLabel: early ? undefined : t('control:neo.comparativa.ctaMesEnCurso'),
    }
  }

  const mirrorPct = Math.max(
    0,
    Math.min(100, Math.round((proyectado / Math.max(1, view.mpTotal)) * 100)),
  )
  const stampDetail = t('control:neo.comparativa.stampDetail', {
    current: formatMoneyShort(proyectado),
    previous: formatMoneyShort(view.mpTotal),
    month,
  })

  switch (variant) {
    case 'menos':
      return {
        ...shared,
        verdictLabel: t('control:neo.comparativa.verdictBien'),
        stampLabel: t('control:neo.comparativa.stampMenos', { month }),
        stampAmount: minusShort(delta),
        stampDetail,
        mirrorPct,
        mirrorLeftLabel: t('control:neo.comparativa.mirrorEsteMes'),
        mirrorRightLabel: t('control:neo.comparativa.mirrorAhorrado'),
        mirrorRightOnFill: false,
        anchorLeft: t('control:neo.comparativa.anchorGastado', {
          amount: formatMoneyShort(proyectado),
        }),
        anchorRight: t('control:neo.comparativa.anchorDebajo', {
          amount: formatMoneyShort(delta),
        }),
      }
    case 'mas':
      return {
        ...shared,
        verdictLabel: t('control:neo.comparativa.verdictOjo'),
        stampLabel: t('control:neo.comparativa.stampMas', { month }),
        stampAmount: plusShort(delta),
        stampDetail,
        mirrorPct: 100,
        mirrorLeftLabel: t('control:neo.comparativa.mirrorEsteMes'),
        mirrorRightLabel: t('control:neo.comparativa.mirrorDeMas'),
        mirrorRightOnFill: true,
        anchorLeft: t('control:neo.comparativa.anchorGastado', {
          amount: formatMoneyShort(proyectado),
        }),
        anchorRight: t('control:neo.comparativa.anchorEncima', {
          amount: formatMoneyShort(Math.abs(delta)),
          month,
        }),
      }
    case 'igual':
    default:
      return {
        ...shared,
        verdictLabel: t('control:neo.comparativa.verdictEstable'),
        stampLabel: t('control:neo.comparativa.stampIgual', { month }),
        stampAmount: `≈ ${formatMoneyShort(view.mpTotal)}`,
        stampDetail,
        mirrorPct,
        mirrorLeftLabel: t('control:neo.comparativa.mirrorEsteMes'),
        mirrorRightLabel: t('control:neo.comparativa.mirrorAhorrado'),
        mirrorRightOnFill: false,
        anchorLeft: t('control:neo.comparativa.anchorGastado', {
          amount: formatMoneyShort(proyectado),
        }),
        anchorRight:
          delta >= 0
            ? t('control:neo.comparativa.anchorDebajo', {
                amount: formatMoneyShort(delta),
              })
            : t('control:neo.comparativa.anchorEncima', {
                amount: formatMoneyShort(Math.abs(delta)),
                month,
              }),
      }
  }
}

// ---------------------------------------------------------------------------
// ④ Tendencia — "Cómo van los últimos 7 días"
// ---------------------------------------------------------------------------

/** Altura del gráfico y nivel del cupo, literales del layout final: chart
 *  64px, línea CUPO a 20.4px del techo → el cupo mapea a 43.6px. */
const TREND_CHART_H = 64
const TREND_CUPO_TOP = 20.4
const TREND_CUPO_H = TREND_CHART_H - TREND_CUPO_TOP

export function selectTendenciaVariant(input: {
  view: ControlView
  cupoDiario: number
}): ControlTendenciaVariant {
  const { view, cupoDiario } = input
  const closed = view.last7.filter((d) => !d.inProgress)
  if (view.closedDays < 5 || closed.length < 4) return 'arranca'
  const anySpend = view.last7.some((d) => d.gasto > 0)
  if (!anySpend) return 'sinGastos'
  if (Number.isFinite(view.momentum) && view.momentum >= 1.15) return 'alza'
  const overDays = cupoDiario > 0 ? closed.filter((d) => d.gasto > cupoDiario) : []
  if (overDays.length >= 1) return 'sobreCupo'
  if (Number.isFinite(view.momentum) && view.momentum <= 0.85) return 'descendente'
  // S4 "estable" = semana casi calcada de la anterior (±5% de momentum);
  // sin ese corte la variante era inalcanzable con cupo > 0.
  if (Number.isFinite(view.momentum) && Math.abs(view.momentum - 1) <= 0.05) return 'estable'
  return 'cuidado'
}

function trendPx(value: number, cupoDiario: number, maxGasto: number): number {
  if (cupoDiario > 0) {
    const px = (value / cupoDiario) * TREND_CUPO_H
    return value > 0 ? Math.min(TREND_CHART_H, Math.max(3, px)) : 0
  }
  if (maxGasto <= 0) return 0
  const px = (value / maxGasto) * TREND_CUPO_H
  return value > 0 ? Math.min(TREND_CHART_H, Math.max(3, px)) : 0
}

export function buildTendenciaBars(input: {
  view: ControlView
  cupoDiario: number
  /** DOW 0=Lun..6=Dom de HOY — `computeControlView` hardcodea `dow: 0`
   *  en la entrada inProgress de last7, así que la etiqueta del día en
   *  curso tiene que venir de afuera (sino todo "hoy" diría "L"). */
  todayDow: number
}): ControlTendenciaBar[] {
  const { view, cupoDiario, todayDow } = input
  const byDia = new Map<number, DayDetail>(view.detalleDias.map((d) => [d.dia, d]))
  const maxGasto = Math.max(
    ...view.last7.map((d) => d.gasto),
    ...view.last7.map((d) => byDia.get(d.dia - 7)?.gasto ?? 0),
    0,
  )
  const bars = view.last7.map((d) => {
    const prev = byDia.get(d.dia - 7)?.gasto ?? 0
    const dow = d.inProgress ? todayDow : d.dow
    return {
      label: dayInitialFromDowIndex(dow),
      prevH: Math.round(trendPx(prev, cupoDiario, maxGasto) * 10) / 10,
      todayH: Math.round(trendPx(d.gasto, cupoDiario, maxGasto) * 10) / 10,
      esHoy: Boolean(d.inProgress),
    }
  })
  // Con < 6 días cerrados last7 trae menos de 7 entradas y el layout de
  // 7 columnas se deformaría: se paddea al INICIO con columnas vacías
  // (los días previos al arranque del ciclo, sin dato), del más cercano
  // al más lejano para que el eje quede en orden.
  const firstDow = view.last7.length > 0 ? view.last7[0].dow : todayDow
  for (let i = 1; bars.length < 7; i++) {
    const dow = (((firstDow - i) % 7) + 7) % 7
    bars.unshift({ label: dayInitialFromDowIndex(dow), prevH: 0, todayH: 0, esHoy: false })
  }
  return bars
}

export function buildTendenciaContent(input: {
  variant: ControlTendenciaVariant
  view: ControlView
  data: ControlMockData
  /** DOW 0=Lun..6=Dom de HOY (ver buildTendenciaBars). */
  todayDow: number
}): Partial<ControlTendenciaContent> {
  const { variant, view, data, todayDow } = input
  const t = i18n.t
  const cupo = data.cupoDiario
  const closed = view.last7.filter((d) => !d.inProgress)
  const under = cupo > 0 ? closed.filter((d) => d.gasto <= cupo).length : 0
  const momentumPct = Number.isFinite(view.momentum)
    ? Math.round((view.momentum - 1) * 100)
    : 0
  const momentumLabel = `${momentumPct > 0 ? '+' : momentumPct < 0 ? '−' : ''}${Math.abs(momentumPct)}%`
  const hasPrevWeek = view.detalleDias.some((d) => view.last7.some((l) => l.dia - 7 === d.dia))

  const bars = buildTendenciaBars({ view, cupoDiario: cupo, todayDow })

  const verdicts: Record<
    ControlTendenciaVariant,
    { label: string; tone: ControlTendenciaContent['verdictTone']; icon: ControlTendenciaContent['verdictIcon']; pose: BrotPose }
  > = {
    cuidado: { label: t('control:neo.tendencia.verdictCuidado'), tone: 'green', icon: 'trend', pose: 'think' },
    descendente: { label: t('control:neo.tendencia.verdictDescendente'), tone: 'green', icon: 'down', pose: 'think' },
    alza: { label: t('control:neo.tendencia.verdictAlza'), tone: 'amber', icon: 'up', pose: 'worried' },
    sobreCupo: {
      label: t('control:neo.tendencia.verdictSobreCupo', {
        count: cupo > 0 ? closed.filter((d) => d.gasto > cupo).length : 0,
      }),
      tone: 'orange',
      icon: 'warn',
      pose: 'sad',
    },
    estable: { label: t('control:neo.tendencia.verdictEstable'), tone: 'muted', icon: 'dash', pose: 'think' },
    arranca: { label: t('control:neo.tendencia.verdictArranca'), tone: 'muted', icon: 'none', pose: 'wave' },
    sinGastos: { label: t('control:neo.tendencia.verdictSinGastos'), tone: 'green', icon: 'leaf', pose: 'cheer' },
  }
  const v = verdicts[variant]

  let insight: ControlTendenciaInsightSegment[]
  switch (variant) {
    case 'alza': {
      const drop = Math.max(0, (view.avgU7 - view.avgP7) * view.diasRestantes)
      insight = [
        { text: t('control:neo.tendencia.insightAlzaPrefix') },
        { text: t('control:neo.tendencia.insightAlzaStrong'), tone: 'amber' },
        { text: t('control:neo.tendencia.insightAlzaMid') },
        { text: t('control:neo.tendencia.insightAlzaAmount', { amount: formatMoneyShort(drop) }), tone: 'amber' },
        { text: t('control:neo.tendencia.insightAlzaSuffix') },
      ]
      break
    }
    case 'sobreCupo': {
      const worst = closed.reduce(
        (acc, d) => (d.gasto - cupo > acc.excess ? { day: d, excess: d.gasto - cupo } : acc),
        { day: closed[0], excess: -Infinity },
      )
      insight = [
        { text: t('control:neo.tendencia.insightSobrePrefix') },
        {
          text: t('control:neo.tendencia.insightSobreStrong', {
            day: worst.day ? dayNameFromDowIndex(worst.day.dow) : '',
          }),
          tone: 'orange',
        },
        {
          text: t('control:neo.tendencia.insightSobreSuffix', {
            amount: formatMoneyShort(Math.max(0, worst.excess)),
          }),
        },
      ]
      break
    }
    case 'estable':
      insight = [
        { text: t('control:neo.tendencia.insightEstablePrefix') },
        { text: t('control:neo.tendencia.insightEstableStrong'), tone: 'green' },
        { text: t('control:neo.tendencia.insightEstableSuffix') },
      ]
      break
    case 'arranca':
      insight = [
        { text: t('control:neo.tendencia.insightArrancaPrefix') },
        { text: t('control:neo.tendencia.insightArrancaStrong'), tone: 'green' },
        { text: t('control:neo.tendencia.insightArrancaSuffix') },
      ]
      break
    case 'sinGastos':
      insight = [
        { text: t('control:neo.tendencia.insightSinGastosPrefix') },
        { text: t('control:neo.tendencia.insightSinGastosStrong'), tone: 'green' },
        { text: t('control:neo.tendencia.insightSinGastosSuffix') },
      ]
      break
    default: {
      const diff = Math.max(0, cupo - view.avgU7)
      insight = [
        { text: t('control:neo.tendencia.insightBienStrong', { amount: formatMoneyShort(diff) }), tone: 'green' },
        { text: t('control:neo.tendencia.insightBienSuffix') },
      ]
    }
  }

  return {
    title: t('control:neo.tendencia.title'),
    verdictLabel: v.label,
    verdictTone: v.tone,
    verdictIcon: v.icon,
    brotPose: v.pose,
    bars,
    cupoTopPx: TREND_CUPO_TOP,
    cupoLabel: t('control:neo.tendencia.cupoTag'),
    stats: {
      promedio: {
        label: t('control:neo.tendencia.statPromedio'),
        value: t('control:neo.tendencia.statPorDia', { amount: formatMoneyShort(view.avgU7) }),
        tone: 'text',
      },
      vsSemana: {
        label: t('control:neo.tendencia.statVsSemana'),
        value: hasPrevWeek ? momentumLabel : t('control:neo.tendencia.statSinDato'),
        tone: hasPrevWeek ? (momentumPct > 0 ? 'amber' : 'green') : 'muted',
      },
      bajoCupo: {
        label: t('control:neo.tendencia.statBajoCupo'),
        value: t('control:neo.tendencia.statBajoCupoValor', {
          under,
          total: Math.max(1, closed.length),
        }),
        tone: under >= closed.length - 1 ? 'green' : 'orange',
      },
    },
    insight,
  }
}

// ---------------------------------------------------------------------------
// ⑤ Patrón semanal — "Tu patrón semanal"
// ---------------------------------------------------------------------------

const WEEKEND_DOWS = [5, 6] as const

export function selectPatronVariant(input: {
  view: ControlView
}): ControlPatronVariant {
  const { view } = input
  const withData = view.porDowEnriched.filter((d) => d.count > 0)
  if (view.diasConGasto < 5 || withData.length < 5) return 'pocosDatos'
  const peorIdx = view.porDowEnriched.indexOf(view.peorDow)
  const isWeekendPeor = WEEKEND_DOWS.includes(peorIdx as 5 | 6)
  if (isWeekendPeor) {
    const otherWeekend = view.porDowEnriched[peorIdx === 5 ? 6 : 5]
    if (otherWeekend && otherWeekend.count > 0 && otherWeekend.ratio > 1.1 && view.peorDow.ratio >= 1.5) {
      return 'findes'
    }
  }
  if (view.peorDow.ratio >= 1.5) return 'pico'
  return 'pareja'
}

export function buildPatronRows(input: { view: ControlView }): ControlPatronRow[] {
  const { view } = input
  const withData = view.porDowEnriched
    .map((d, idx) => ({ ...d, idx }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.avg - a.avg)
  const zeroRows = view.porDowEnriched
    .map((d, idx) => ({ ...d, idx }))
    .filter((d) => d.count === 0)
  const maxAvg = withData.length > 0 ? withData[0].avg : 0
  const sinDato = i18n.t('control:neo.patron.sinDato')

  // Ciclo sin un solo gasto: los días registrados existen (count > 0)
  // pero todos promedian 0. Rankearlos daría 7 filas "$0" con barras
  // vacías y un tag MEJOR arbitrario, contradiciendo el propio cuerpo
  // de la card ("llevás 0 de 7 días"). Se muestran todos como sin dato.
  if (maxAvg <= 0) {
    return view.porDowEnriched.map((_, idx) => ({
      day: dayNameFromDowIndex(idx),
      dayTone: 'plain' as const,
      widthPct: 0,
      fill: 'neutral' as const,
      amount: sinDato,
      amountTone: 'plain' as const,
      dim: true,
    }))
  }

  const rows: ControlPatronRow[] = withData.map((d, i) => {
    const isPeor = i === 0 && withData.length > 1 && d.ratio > 1
    const isMejor = i === withData.length - 1 && withData.length > 1
    return {
      day: dayNameFromDowIndex(d.idx),
      dayTone: isPeor ? 'orange' : isMejor ? 'green' : 'plain',
      widthPct: maxAvg > 0 ? Math.max(4, Math.round((d.avg / maxAvg) * 100)) : 0,
      fill: isPeor ? 'orange' : isMejor ? 'green' : 'neutral',
      amount: formatMoneyShort(d.avg),
      amountTone: isPeor ? 'orange' : isMejor ? 'green' : 'plain',
      tag: isPeor ? 'peor' : isMejor ? 'mejor' : undefined,
    }
  })
  for (const d of zeroRows) {
    rows.push({
      day: dayNameFromDowIndex(d.idx),
      dayTone: 'plain',
      widthPct: 0,
      fill: 'neutral',
      amount: sinDato,
      amountTone: 'plain',
      dim: true,
    })
  }
  return rows
}

export function buildPatronContent(input: {
  variant: ControlPatronVariant
  view: ControlView
  data: ControlMockData
  /** DOW 0=Lun..6=Dom de HOY (para el "Hoy es Miércoles" del tip). */
  todayDow: number
}): Partial<ControlPatronContent> {
  const { variant, view, todayDow } = input
  const t = i18n.t
  const rows = buildPatronRows({ view })
  const maxAvg = view.peorDow.avg
  const promPos =
    maxAvg > 0 ? Math.max(5, Math.min(95, Math.round((view.globalAvg / maxAvg) * 10000) / 100)) : 50
  const peorIdx = view.porDowEnriched.indexOf(view.peorDow)
  const mejorIdx = view.porDowEnriched.indexOf(view.mejorDow)
  const peorName = dayNameFromDowIndex(peorIdx)
  const mejorName = dayNameFromDowIndex(mejorIdx)
  const ratio = view.globalAvg > 0 ? Math.round((view.peorDow.avg / view.globalAvg) * 10) / 10 : 0
  const overDays = view.porDowEnriched
    .map((d, idx) => ({ ...d, idx }))
    .filter((d) => d.count > 0 && d.avg > view.globalAvg)
    .sort((a, b) => b.avg - a.avg)
    .map((d) => dayNameFromDowIndex(d.idx))
  const promLabel = t('control:neo.patron.promTag', { amount: formatMoneyShort(view.globalAvg) })

  const shared: Partial<ControlPatronContent> = {
    title: t('control:neo.patron.title'),
    colDayLabel: t('control:neo.patron.colDia'),
    colAmountLabel: t('control:neo.patron.colGasto'),
    tagWorstLabel: t('control:neo.patron.tagPeor'),
    tagBestLabel: t('control:neo.patron.tagMejor'),
    promLabel,
    promPos,
    rows,
  }

  switch (variant) {
    case 'pico': {
      // Ahorro estimado si el peor día baja al promedio: exceso medio ×
      // veces que ese día apareció en el ciclo (aproximación honesta con
      // los datos del ciclo, no una promesa a futuro).
      const savings = Math.max(0, (view.peorDow.avg - view.globalAvg) * view.peorDow.count)
      const tipHoy = todayDow === peorIdx
      const tip: ControlPatronSegment[] = [
        { text: t('control:neo.patron.tipPicoA', { day: peorName }), tone: 'plain' },
        { text: t('control:neo.patron.tipPicoAhorro', { amount: formatMoneyShort(savings) }), tone: 'green' },
        { text: t('control:neo.patron.tipPicoB'), tone: 'plain' },
      ]
      if (tipHoy) {
        tip.push(
          { text: t('control:neo.patron.tipPicoHoy', { day: peorName }), tone: 'orange' },
          { text: t('control:neo.patron.tipPicoC'), tone: 'plain' },
        )
      }
      return {
        ...shared,
        verdictLabel: t('control:neo.patron.verdictPico', { day: peorName }),
        verdictTone: 'orange',
        verdictIcon: 'none',
        headline: [
          { text: t('control:neo.patron.headlinePicoA'), tone: 'plain' },
          { text: t('control:neo.patron.headlinePicoPeor', { day: peorName }), tone: 'orange' },
          { text: t('control:neo.patron.headlinePicoB'), tone: 'plain' },
          { text: t('control:neo.patron.headlinePicoRatio', { ratio }), tone: 'orange' },
          { text: t('control:neo.patron.headlinePicoC'), tone: 'plain' },
          { text: t('control:neo.patron.headlinePicoMejor', { day: mejorName }), tone: 'green' },
          { text: t('control:neo.patron.headlinePicoD'), tone: 'plain' },
        ],
        insightBrotPose: 'think',
        insight: [
          { text: t('control:neo.patron.insightPicoPrefix'), tone: 'plain' },
          { text: t('control:neo.patron.insightPicoStrong'), tone: 'strong' },
          { text: t('control:neo.patron.insightPicoSuffix', { days: joinDays(overDays) }), tone: 'plain' },
        ],
        tip,
      }
    }
    case 'findes': {
      const savings = Math.max(
        0,
        WEEKEND_DOWS.reduce((acc, idx) => {
          const d = view.porDowEnriched[idx]
          return acc + Math.max(0, (d.avg - view.globalAvg) * d.count)
        }, 0),
      )
      const tipFinde = todayDow >= 3 && todayDow <= 4
      const tip: ControlPatronSegment[] = [
        { text: t('control:neo.patron.tipFindesA'), tone: 'plain' },
        { text: t('control:neo.patron.tipFindesAhorro', { amount: formatMoneyShort(savings) }), tone: 'green' },
        { text: t('control:neo.patron.tipFindesB'), tone: 'plain' },
      ]
      if (tipFinde) {
        tip.push(
          { text: t('control:neo.patron.tipFindesStrong'), tone: 'orange' },
          { text: t('control:neo.patron.tipFindesC'), tone: 'plain' },
        )
      }
      return {
        ...shared,
        verdictLabel: t('control:neo.patron.verdictFindes'),
        verdictTone: 'orange',
        verdictIcon: 'none',
        headline: [
          { text: t('control:neo.patron.headlineFindesA'), tone: 'plain' },
          { text: t('control:neo.patron.headlineFindesPeor', { day: peorName }), tone: 'orange' },
          { text: t('control:neo.patron.headlineFindesB'), tone: 'plain' },
          { text: t('control:neo.patron.headlineFindesRatio', { ratio }), tone: 'orange' },
          { text: t('control:neo.patron.headlineFindesC'), tone: 'plain' },
        ],
        insightBrotPose: 'worried',
        insight: [
          {
            text: t('control:neo.patron.insightFindesStrong', {
              days: joinDays([dayNameFromDowIndex(5), dayNameFromDowIndex(6)]),
            }),
            tone: 'strong',
          },
          { text: t('control:neo.patron.insightFindesSuffix'), tone: 'plain' },
        ],
        tip,
      }
    }
    case 'pocosDatos':
      return {
        ...shared,
        // WP-D omite a propósito el encabezado DÍA/GASTO y la línea
        // PROM (con < 5 días el promedio todavía no es una referencia).
        promLabel: undefined,
        promPos: undefined,
        verdictLabel: t('control:neo.patron.verdictPocosDatos'),
        verdictTone: 'faint',
        verdictIcon: 'none',
        headline: [{ text: t('control:neo.patron.headlinePocosTitle'), tone: 'plain' }],
        subline: [
          { text: t('control:neo.patron.headlinePocosBodyPrefix'), tone: 'plain' },
          {
            text: t('control:neo.patron.headlinePocosBodyStrong', { n: view.diasConGasto }),
            tone: 'strong',
          },
          { text: t('control:neo.patron.headlinePocosBodySuffix'), tone: 'plain' },
        ],
        insightBrotPose: 'wave',
        insight: [{ text: t('control:neo.patron.insightPocos'), tone: 'plain' }],
        tip: [
          { text: t('control:neo.patron.tipPocosA'), tone: 'plain' },
          { text: t('control:neo.patron.tipPocosStrong'), tone: 'strong' },
          { text: t('control:neo.patron.tipPocosB'), tone: 'plain' },
        ],
      }
    case 'pareja':
    default:
      return {
        ...shared,
        verdictLabel: t('control:neo.patron.verdictPareja'),
        verdictTone: 'green',
        verdictIcon: 'check',
        headline: [
          { text: t('control:neo.patron.headlineParejaA'), tone: 'plain' },
          { text: t('control:neo.patron.headlineParejaStrong'), tone: 'green' },
          { text: t('control:neo.patron.headlineParejaB'), tone: 'plain' },
        ],
        insightBrotPose: 'cheer',
        insight: [
          { text: t('control:neo.patron.insightParejaPrefix'), tone: 'plain' },
          { text: t('control:neo.patron.insightParejaStrong'), tone: 'strong' },
          { text: t('control:neo.patron.insightParejaSuffix'), tone: 'plain' },
        ],
        tip: [
          { text: t('control:neo.patron.tipParejaA'), tone: 'plain' },
          { text: t('control:neo.patron.tipParejaStrong'), tone: 'green' },
          { text: t('control:neo.patron.tipParejaB'), tone: 'plain' },
        ],
      }
  }
}

// ---------------------------------------------------------------------------
// ⑥ Reparto — "Tu sueldo en días"
// ---------------------------------------------------------------------------

export function selectRepartoVariant(input: {
  fijosMes: number
  ahorroMes: number
  ingresoMes: number
  incomeMode: 'fixed' | 'dynamic'
}): ControlRepartoVariant {
  if (input.fijosMes <= 0) return 'sinFijos'
  if (input.incomeMode === 'dynamic') return 'ingresoVariable'
  const ratio = input.ingresoMes > 0 ? input.fijosMes / input.ingresoMes : 0
  if (ratio >= 0.35) return 'fijosAltos'
  return input.ahorroMes > 0 ? 'ahorroActivo' : 'sinAhorro'
}

export function buildRepartoContent(input: {
  variant: ControlRepartoVariant
  view: ControlView
  data: ControlMockData
  ahorroMes: number
}): Partial<ControlRepartoContent> {
  const { variant, view, data, ahorroMes } = input
  const t = i18n.t
  const total = data.diasMes
  const fijosDias = Math.max(0, Math.min(total, view.coberturaFijos))
  const ahorroDias =
    data.ingresoMes > 0 ? Math.max(0, Math.round((ahorroMes / data.ingresoMes) * total)) : 0
  const libresDias = Math.max(0, total - fijosDias - ahorroDias)
  const fijosPct = data.ingresoMes > 0 ? Math.round((data.fijosMes / data.ingresoMes) * 100) : 0
  const ahorroPct = data.ingresoMes > 0 ? Math.round((ahorroMes / data.ingresoMes) * 100) : 0
  const librePct = Math.max(0, 100 - fijosPct - ahorroPct)
  const hoyPos = Math.max(0, Math.min(100, Math.round((data.diaActual / Math.max(1, total)) * 100)))
  const hoyTag = { label: t('control:neo.reparto.hoyTag', { day: data.diaActual }), pos: hoyPos }

  const tiles = {
    fijos: {
      label: t('control:neo.reparto.tileFijos'),
      value: formatMoneyShort(data.fijosMes),
      sub:
        variant === 'ingresoVariable'
          ? t('control:neo.reparto.tileSubPctCobro', { pct: fijosPct })
          : t('control:neo.reparto.tileSubDias', { d: fijosDias, pct: fijosPct }),
      valueTone: 'ink' as const,
    },
    ahorro:
      ahorroMes > 0
        ? {
            label: t('control:neo.reparto.tileAhorro'),
            value: formatMoneyShort(ahorroMes),
            sub: t('control:neo.reparto.tileSubDias', { d: ahorroDias, pct: ahorroPct }),
            valueTone: 'ink' as const,
          }
        : {
            label: t('control:neo.reparto.tileAhorro'),
            value: formatMoney(0),
            sub: t('control:neo.reparto.tileSubSinDefinir'),
            valueTone: 'faint' as const,
          },
    libre: {
      label: t('control:neo.reparto.tileLibre'),
      value: formatMoneyShort(data.libreMes),
      sub:
        variant === 'ingresoVariable'
          ? t('control:neo.reparto.tileSubPctCobro', { pct: librePct })
          : t('control:neo.reparto.tileSubDias', { d: libresDias, pct: librePct }),
      valueTone: 'ink' as const,
    },
  }

  const brotSinAhorro = {
    pose: 'think' as BrotPose,
    title: t('control:neo.reparto.brotSinAhorroTitle'),
    body: [
      { text: t('control:neo.reparto.brotSinAhorroBodyA') },
      { text: t('control:neo.reparto.brotSinAhorroStrong'), tone: 'green' as const },
      { text: t('control:neo.reparto.brotSinAhorroBodyB') },
    ] satisfies RepartoTextSegment[],
    ctaLabel: t('control:neo.reparto.ctaDefinir'),
  }

  switch (variant) {
    case 'sinFijos':
      return {
        title: t('control:neo.reparto.title'),
        verdictLabel: t('control:neo.reparto.verdictSinFijos'),
        verdictTone: 'faint',
        verdictIcon: 'info',
        headline: [{ text: t('control:neo.reparto.headlineSinFijos') }],
        hoyTag: undefined,
        segments: [],
        scale: undefined,
        tiles: undefined,
        placeholderLabel: t('control:neo.reparto.sinFijosPlaceholder'),
        emptyBody: t('control:neo.reparto.sinFijosBody'),
        brot: {
          pose: 'wave',
          title: t('control:neo.reparto.brotSinFijosTitle'),
          body: [{ text: t('control:neo.reparto.sinFijosBody') }],
          ctaLabel: t('control:neo.reparto.ctaAgregar'),
        },
      }
    case 'ingresoVariable':
      return {
        title: t('control:neo.reparto.title'),
        verdictLabel: t('control:neo.reparto.verdictVariable'),
        verdictTone: 'faint',
        verdictIcon: 'info',
        headline: [
          { text: t('control:neo.reparto.headlineVariableA') },
          { text: t('control:neo.reparto.headlineVariableStrong'), tone: 'ink' },
          { text: t('control:neo.reparto.headlineVariableB') },
          { text: t('control:neo.reparto.headlineVariableStrong2'), tone: 'green' },
          { text: t('control:neo.reparto.headlineVariableC') },
        ],
        hoyTag: undefined,
        segments: [
          {
            kind: 'fijos',
            flex: Math.max(1, fijosPct),
            label: `${fijosPct}%`,
          },
          {
            kind: 'libre',
            flex: Math.max(1, 100 - fijosPct),
            label: t('control:neo.reparto.segLibre'),
            sub: `${100 - fijosPct}%`,
          },
        ],
        // SD-C: bajo una barra de porcentajes la escala no habla de
        // días — "de tu último cobro …… $total" (fixture literal).
        scale: {
          left: t('control:neo.reparto.escalaCobro'),
          right: formatMoneyShort(data.ingresoMes),
          rightStrong: true,
        },
        tiles,
        brot: ahorroMes > 0
          ? {
              pose: 'think',
              title: t('control:neo.reparto.brotVariableTitle'),
              body: [
                { text: t('control:neo.reparto.brotVariableBodyA') },
                { text: t('control:neo.reparto.brotVariableStrong', { pct: fijosPct }), tone: 'orange' },
                { text: t('control:neo.reparto.brotVariableBodyB') },
              ],
            }
          : {
              ...brotSinAhorro,
              pose: 'think',
              title: t('control:neo.reparto.brotVariableTitle'),
              body: [
                { text: t('control:neo.reparto.brotVariableBodyA') },
                { text: t('control:neo.reparto.brotVariableStrong', { pct: fijosPct }), tone: 'orange' },
                { text: t('control:neo.reparto.brotVariableBodyB') },
              ],
            },
      }
    case 'fijosAltos':
      return {
        title: t('control:neo.reparto.title'),
        verdictLabel: t('control:neo.reparto.verdictAjustado', { pct: fijosPct }),
        verdictTone: 'orange',
        verdictIcon: 'warning',
        headline: [
          { text: t('control:neo.reparto.headlineFijosAltosA') },
          {
            text: t('control:neo.reparto.headlineFijosAltosStrong', { fijos: fijosDias, total }),
            tone: 'orange',
          },
          { text: t('control:neo.reparto.headlineFijosAltosB') },
          {
            text: t('control:neo.reparto.headlineFijosAltosLibres', { count: libresDias }),
            tone: 'green',
          },
          { text: t('control:neo.reparto.headlineFijosAltosC') },
        ],
        hoyTag,
        // Con ahorro definido el tramo teal también existe acá — SD-B lo
        // dibuja sin ahorro, pero omitirlo desalinearía escala/HOY/tiles.
        segments: [
          {
            kind: 'fijos',
            flex: Math.max(1, fijosDias),
            label: t('control:neo.reparto.segDiasFijos', { n: fijosDias }),
            sub: formatMoneyShort(data.fijosMes),
          },
          ...(ahorroDias > 0
            ? [
                {
                  kind: 'ahorro' as const,
                  flex: Math.max(1, ahorroDias),
                  label: t('control:neo.reparto.segFijosDias', { n: ahorroDias }),
                },
              ]
            : []),
          {
            kind: 'libre',
            flex: Math.max(1, libresDias),
            label: t('control:neo.reparto.segLibresCorto', { n: libresDias }),
          },
        ],
        scale: {
          left: t('control:neo.reparto.escalaDia1'),
          mid: {
            label: t('control:neo.reparto.escalaDiaN', { n: fijosDias }),
            pos: Math.round((fijosDias / Math.max(1, total)) * 1000) / 10,
            tone: 'orange',
          },
          right: t('control:neo.reparto.escalaDiaN', { n: total }),
        },
        tiles,
        brot: {
          pose: 'worried',
          title: t('control:neo.reparto.brotFijosAltosTitle'),
          body: [
            { text: t('control:neo.reparto.brotFijosAltosBodyA') },
            { text: t('control:neo.reparto.brotFijosAltosStrong'), tone: 'green' },
            { text: t('control:neo.reparto.brotFijosAltosBodyB') },
          ],
          ctaLabel: t('control:neo.reparto.ctaVerFijos'),
        },
      }
    case 'ahorroActivo':
      return {
        title: t('control:neo.reparto.title'),
        verdictLabel: t('control:neo.reparto.verdictSaludable'),
        verdictTone: 'green',
        verdictIcon: 'check',
        headline: [
          { text: t('control:neo.reparto.headlineAhorroFijos', { count: fijosDias }), tone: 'orange' },
          { text: t('control:neo.reparto.headlineAhorroA', { count: fijosDias }) },
          { text: t('control:neo.reparto.headlineAhorroAhorro', { n: ahorroDias }), tone: 'teal' },
          { text: t('control:neo.reparto.headlineAhorroB') },
          { text: t('control:neo.reparto.headlineAhorroLibres', { count: libresDias }), tone: 'green' },
          { text: t('control:neo.reparto.headlineAhorroC') },
        ],
        hoyTag,
        segments: [
          {
            kind: 'fijos',
            flex: Math.max(1, fijosDias),
            label: t('control:neo.reparto.segFijosDias', { n: fijosDias }),
          },
          {
            kind: 'ahorro',
            flex: Math.max(1, ahorroDias),
            label: t('control:neo.reparto.segFijosDias', { n: ahorroDias }),
          },
          {
            kind: 'libre',
            flex: Math.max(1, libresDias),
            label: t('control:neo.reparto.segLibresCorto', { n: libresDias }),
            sub: formatMoneyShort(data.libreMes),
          },
        ],
        scale: {
          left: t('control:neo.reparto.escalaDia1'),
          // La marca "ahorro" va al FINAL del tramo teal (SD-A: 36.7% =
          // día 11 de 30 = fijos 6 + ahorro 5), no a su centro.
          mid: {
            label: t('control:neo.reparto.escalaAhorro'),
            pos: Math.round(((fijosDias + ahorroDias) / Math.max(1, total)) * 1000) / 10,
            tone: 'teal',
          },
          right: t('control:neo.reparto.escalaDiaN', { n: total }),
        },
        tiles,
        brot: {
          pose: 'cheer',
          title: t('control:neo.reparto.brotAhorroTitle'),
          body: [
            { text: t('control:neo.reparto.brotAhorroBodyA') },
            { text: t('control:neo.reparto.brotAhorroStrong', { amount: formatMoneyShort(ahorroMes) }), tone: 'teal' },
            { text: t('control:neo.reparto.brotAhorroBodyB') },
          ],
        },
      }
    case 'sinAhorro':
    default:
      return {
        title: t('control:neo.reparto.title'),
        verdictLabel: t('control:neo.reparto.verdictFijosOk', { pct: fijosPct }),
        verdictTone: 'green',
        verdictIcon: 'check',
        headline: [
          { text: t('control:neo.reparto.headlineA', { total }) },
          { text: t('control:neo.reparto.headlineFijos', { count: fijosDias }), tone: 'orange' },
          { text: t('control:neo.reparto.headlineB') },
          { text: t('control:neo.reparto.headlineLibres', { count: libresDias }), tone: 'green' },
          { text: t('control:neo.reparto.headlineC') },
        ],
        hoyTag,
        segments: [
          {
            kind: 'fijos',
            flex: Math.max(1, fijosDias),
            label: t('control:neo.reparto.segFijosDias', { n: fijosDias }),
          },
          {
            kind: 'libre',
            flex: Math.max(1, libresDias),
            label: t('control:neo.reparto.segLibres', { n: libresDias }),
            sub: formatMoneyShort(data.libreMes),
          },
        ],
        scale: {
          left: t('control:neo.reparto.escalaDia1'),
          mid: {
            label: t('control:neo.reparto.escalaDiaN', { n: fijosDias }),
            pos: Math.round((fijosDias / Math.max(1, total)) * 1000) / 10,
            tone: 'orange',
          },
          right: t('control:neo.reparto.escalaDiaN', { n: total }),
        },
        tiles,
        brot: brotSinAhorro,
      }
  }
}

// ---------------------------------------------------------------------------
// ⑦ Alcancía / Meta
// ---------------------------------------------------------------------------

export function selectAlcanciaVariant(input: {
  goal: SavingsGoal | null
  vault: number
  diaActual: number
  diasConGasto: number
  closedDays: number
}): ControlAlcanciaVariant {
  const { goal, vault, diaActual, diasConGasto, closedDays } = input
  if (goal && goal.isActive) {
    return goal.currentAmount >= goal.goalAmount ? 'cumplida' : 'enMarcha'
  }
  // Sin meta activa: estados del frasco (vault = sobrante acumulado del
  // ciclo). Mismos pisos que la ControlV2AlcanciaCard vieja (5 días /
  // 3 con gasto) para no estrenar un umbral nuevo acá.
  if (diasConGasto === 0) return 'vacia'
  if (diaActual < 5 || diasConGasto < 3) return 'arrancando'
  if (vault <= 0 && closedDays >= 7) return 'sinAporte'
  return vault > 0 ? 'inactiva' : 'arrancando'
}

export function buildAlcanciaContent(input: {
  variant: ControlAlcanciaVariant
  goal: SavingsGoal | null
  vault: number
  monthlyIncome: number
  diaActual: number
  diasMes: number
}): Partial<ControlAlcanciaContent> {
  const { variant, goal, vault, monthlyIncome, diaActual, diasMes } = input
  const t = i18n.t

  switch (variant) {
    case 'enMarcha': {
      const target = Math.max(1, goal?.goalAmount ?? 1)
      const current = Math.max(0, goal?.currentAmount ?? 0)
      const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)))
      const remaining = Math.max(0, target - current)
      const ciclos =
        vault > 0 ? Math.max(1, Math.ceil(remaining / vault)) : (goal?.targetMonths ?? null)
      return {
        title: t('control:neo.meta.title'),
        pillLabel: t('control:neo.meta.verdictEnMarcha'),
        pillTone: 'green',
        pillIcon: 'check',
        jar: { fillPct: pct, fill: 'green', pctLabel: `${pct}%` },
        right: {
          kind: 'acumulado',
          label: t('control:neo.meta.acumulado'),
          amount: formatMoneyShort(current),
          amountSub: t('control:neo.meta.de', { amount: formatMoneyShort(target) }),
          barPct: pct,
        },
        goalChip: goal
          ? {
              emoji: goalEmojiGlyph(goal.emoji),
              name: goal.title,
              rest:
                ciclos != null
                  ? `${t('control:neo.meta.goalChipFaltan', { amount: formatMoneyShort(remaining) })}${t('control:neo.meta.goalChipCiclos', { count: ciclos })}`
                  : t('control:neo.meta.goalChipFaltan', {
                      amount: formatMoneyShort(remaining),
                    }).replace(/ · $/, ''),
            }
          : undefined,
        brotPose: 'love',
        primaryCta: { label: t('control:neo.meta.ctaSumar'), kind: 'radial' },
        secondaryCta: { label: t('control:neo.meta.ctaEditar'), kind: 'ghost' },
      }
    }
    case 'cumplida':
      return {
        title: t('control:neo.meta.title'),
        pillLabel: t('control:neo.meta.verdictCumplida'),
        pillTone: 'green',
        jar: { fillPct: 100, fill: 'full', metaPos: 2, ticks: true, metaLabel: t('control:neo.meta.metaTag') },
        right: {
          kind: 'celebracion',
          title: t('control:neo.meta.cumplidaTitle'),
          amount: formatMoney(goal?.goalAmount ?? 0),
          note:
            goal?.targetMonths != null
              ? t('control:neo.meta.cumplidaSub', { count: goal.targetMonths })
              : '',
        },
        goalChip: undefined,
        brotPose: 'cheer',
        primaryCta: { label: t('control:neo.meta.ctaRetirar'), kind: 'ghost' },
        secondaryCta: { label: t('control:neo.meta.ctaNuevaMeta'), kind: 'radial' },
      }
    case 'inactiva': {
      const pctSueldo =
        monthlyIncome > 0
          ? Math.max(0, Math.min(100, Math.round((vault / monthlyIncome) * 100)))
          : null
      return {
        title: t('control:neo.meta.titleAlcancia'),
        pillLabel: t('control:neo.meta.verdictInactiva'),
        pillTone: 'faint',
        // Sin monthlyIncome (hogar dinámico) no hay "% de un sueldo":
        // frasco a un nivel bajo fijo y sin barra/remate.
        jar: { fillPct: pctSueldo ?? 30, fill: 'green', metaPos: 20, ticks: true, metaLabel: t('control:neo.meta.metaTag') },
        right: {
          kind: 'progreso',
          label: t('control:neo.meta.listoParaMeta'),
          amount: `+${formatMoney(vault)}`,
          note:
            pctSueldo != null ? t('control:neo.meta.pctSueldo', { pct: pctSueldo }) : '',
          barPct: pctSueldo ?? undefined,
          endnote:
            monthlyIncome > 0
              ? t('control:neo.meta.faltanLlenar', {
                  amount: formatMoneyShort(Math.max(0, monthlyIncome - vault)),
                })
              : undefined,
        },
        goalChip: undefined,
        brotPose: 'love',
        primaryCta: { label: t('control:neo.meta.ctaActivar'), kind: 'radial' },
        secondaryCta: undefined,
      }
    }
    case 'arrancando':
      return {
        title: t('control:neo.meta.titleAlcancia'),
        pillLabel: t('control:neo.meta.verdictDia', { day: diaActual, total: diasMes }),
        pillTone: 'faint',
        jar: {
          fillPct: Math.max(
            4,
            Math.min(30, Math.round((diaActual / Math.max(1, diasMes)) * 100)),
          ),
          fill: 'green',
          metaPos: 20,
          ticks: true,
          metaLabel: t('control:neo.meta.metaTag'),
        },
        right: {
          kind: 'progreso',
          label: t('control:neo.meta.guardadoHoy'),
          amount: `+${formatMoney(Math.max(0, vault))}`,
          note: t('control:neo.meta.arrancandoSub'),
        },
        goalChip: undefined,
        brotPose: 'wave',
        primaryCta: { label: t('control:neo.meta.ctaActivar'), kind: 'radial' },
        secondaryCta: undefined,
      }
    case 'vacia':
      return {
        title: t('control:neo.meta.titleAlcancia'),
        pillLabel: t('control:neo.meta.verdictSinDatos'),
        pillTone: 'faint',
        jar: { fillPct: 0, fill: 'none', ticks: true, emptyLabel: t('control:neo.meta.jarVacio') },
        right: {
          kind: 'vacio',
          title: t('control:neo.meta.vacioTitle'),
          body: t('control:neo.meta.vacioBody'),
        },
        goalChip: undefined,
        brotPose: 'wave',
        primaryCta: { label: t('control:neo.meta.ctaRegistrar'), kind: 'radial' },
        secondaryCta: undefined,
      }
    case 'sinAporte':
    default:
      return {
        title: t('control:neo.meta.titleAlcancia'),
        pillLabel: t('control:neo.meta.verdictSinAporte'),
        pillTone: 'amber',
        jar: { fillPct: 6, fill: 'amber', metaPos: 20, ticks: true, metaLabel: t('control:neo.meta.metaTag') },
        right: {
          kind: 'progreso',
          label: t('control:neo.meta.sinAporteLabel'),
          labelTone: 'amber',
          amount: formatMoney(0),
          note: t('control:neo.meta.sinAporteBody'),
        },
        goalChip: undefined,
        brotPose: 'worried',
        primaryCta: { label: t('control:neo.meta.ctaVerEnQueSeFue'), kind: 'ghost' },
        secondaryCta: undefined,
      }
  }
}

// ---------------------------------------------------------------------------
// ⑧ INGRESOS — "Entró este ciclo"
// ---------------------------------------------------------------------------

/** Cuántos movimientos entran en el pozo antes de colapsar en "+N más".
 *  Mismo tope que traía la card vieja: la lista es un vistazo, no el feed. */
const INGRESOS_MAX_VISIBLE = 3

/** "2026-06-04" → "4 jun". Ancla la fecha al MEDIODÍA local a propósito:
 *  `new Date('YYYY-MM-DD')` parsea como UTC y en zonas al oeste de
 *  Greenwich devuelve el día anterior. Misma trampa que ya documentaba la
 *  card vieja. */
function fechaCorta(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0)
  if (!Number.isFinite(date.getTime())) return ''
  return getDateTimeFormat({ day: 'numeric', month: 'short' })
    .format(date)
    .replace(/\.$/, '')
    .replace(/\./g, '')
}

/** La decisión se toma por el TOTAL, nunca por el largo de la lista. Son dos
 *  fuentes distintas (el total es una suma server-side, los movimientos otra
 *  query) y pueden divergir: con el largo mandando, la card llegaba a afirmar
 *  "todavía no cargaste ningún cobro" sobre un ciclo que SÍ tenía ingresos.
 *  Un total > 0 con la lista vacía rinde la card sin el pozo — sin filas que
 *  mostrar, pero sin mentir sobre el estado. */
export function selectIngresosVariant(input: {
  total: number
  incomeMode: 'fixed' | 'dynamic'
}): ControlIngresosVariant {
  if (input.total <= 0) return 'vacio'
  return input.incomeMode === 'dynamic' ? 'variable' : 'extra'
}

export function buildIngresosContent(input: {
  variant: ControlIngresosVariant
  ingresos: IngresosCiclo
}): Partial<ControlIngresosContent> {
  const { variant, ingresos } = input
  const t = i18n.t
  const { total, movimientos } = ingresos

  if (variant === 'vacio') {
    return {
      title: t('control:ingresos.eyebrow'),
      verdictLabel: t('control:neo.ingresos.vacioPill'),
      verdictTone: 'faint',
      headline: [
        { text: t('control:neo.ingresos.vacioHeadlinePre') },
        { text: t('control:neo.ingresos.vacioHeadlineWord'), tone: 'ink' },
        { text: t('control:neo.ingresos.vacioHeadlinePost') },
      ],
      rows: [],
      moreLabel: undefined,
      placeholderLabel: t('control:neo.ingresos.vacioPlaceholder'),
      brot: {
        pose: 'wave',
        title: t('control:neo.ingresos.vacioBrotTitle'),
        body: [{ text: t('control:neo.ingresos.vacioBrotBody') }],
        ctaLabel: t('control:neo.ingresos.vacioCta'),
      },
    }
  }

  const visibles = movimientos.slice(0, INGRESOS_MAX_VISIBLE)
  const ocultos = movimientos.length - visibles.length
  const rows: IngresosRow[] = visibles.map((mov) => {
    const meta = INCOME_KIND_BY_KEY[mov.kind] ?? INCOME_KIND_BY_KEY.other
    const kindLabel = t(meta.labelKey)
    const fecha = fechaCorta(mov.fecha)
    return {
      id: mov.id,
      // Emoji del catálogo central, NO sticker: convención del sistema
      // para ingresos (ver el docblock de `control-ingresos.tsx`).
      glyph: meta.emoji,
      title: mov.descripcion?.trim() || kindLabel,
      sub: fecha ? `${fecha} · ${kindLabel}` : kindLabel,
      amount: `+${formatMoney(mov.monto)}`,
    }
  })

  // El headline NO traduce el total a "+$X/día de cupo", como sí hacía la
  // card vieja. Ese número dividía por los días TOTALES del ciclo, pero el
  // motor reparte entre los días RESTANTES en cuanto el ciclo tiene override
  // — que es justo el estado que deja la CTA "Sumar al ciclo" de la card de
  // reserva. Dos cifras distintas para la misma plata, en la misma pantalla.
  // Se declara el total, que es un hecho, y el cupo lo dice el hero.
  const headline: IngresosTextSegment[] =
    variant === 'variable'
      ? [
          { text: t('control:neo.ingresos.varHeadlinePre') },
          { text: formatMoney(total), tone: 'green' },
          { text: t('control:neo.ingresos.varHeadlinePost') },
        ]
      : [
          { text: t('control:neo.ingresos.extraHeadlinePre') },
          { text: formatMoney(total), tone: 'green' },
          { text: t('control:neo.ingresos.extraHeadlinePost') },
        ]

  return {
    title: t('control:ingresos.eyebrow'),
    verdictLabel:
      movimientos.length > 1
        ? `+${formatMoneyShort(total)} · ${movimientos.length}`
        : `+${formatMoneyShort(total)}`,
    verdictTone: 'green',
    headline,
    rows,
    moreLabel: ocultos > 0 ? t('control:ingresos.more', { count: ocultos }) : undefined,
    // Con total > 0 la card NUNCA muestra el pozo punteado: ese placeholder
    // dice "todavía no entró nada", y acá sí entró — solo que la lista de
    // movimientos no llegó.
    placeholderLabel: undefined,
    // SIN CTA "a la meta". Sonaba bien pero era falso: aportar a la meta solo
    // incrementa `savings_goals.current_amount` y NO descuenta del cupo, así
    // que la misma plata quedaba contada como ahorrada Y como disponible. La
    // card informa; mover plata a la meta se hace desde la alcancía, que sí
    // es su lugar.
    brot:
      variant === 'variable'
        ? {
            pose: 'coach',
            title: t('control:neo.ingresos.varBrotTitle'),
            body: [
              { text: t('control:neo.ingresos.varBrotBodyPre') },
              { text: t('control:neo.ingresos.varBrotBodyWord'), tone: 'green' },
              { text: t('control:neo.ingresos.varBrotBodyPost') },
            ],
          }
        : {
            pose: 'cheer',
            title: t('control:neo.ingresos.extraBrotTitle'),
            body: [
              { text: t('control:neo.ingresos.extraBrotBodyPre') },
              { text: t('control:neo.ingresos.extraBrotBodyWord'), tone: 'green' },
              { text: t('control:neo.ingresos.extraBrotBodyPost') },
            ],
          },
  }
}

// ---------------------------------------------------------------------------
// ⑨ RESERVA — "Reserva acumulada"
// ---------------------------------------------------------------------------

/** Tres estados, no dos. La distinción importa porque el hogar tiene UNA
 *  sola meta: ofrecer "crear" con una meta pausada abriría el wizard para
 *  pisar la que ya existe.
 *   · sin meta      → la CTA crea la meta y el cableado le aplica la reserva;
 *   · meta pausada  → la CTA la REACTIVA (no se puede aportar a una inactiva);
 *   · meta activa   → la CTA abre el sheet de monto. */
export function selectReservaVariant(input: {
  goal: Pick<SavingsGoal, 'isActive'> | null
}): ControlReservaVariant {
  if (input.goal == null) return 'sinMeta'
  return input.goal.isActive ? 'conMeta' : 'metaPausada'
}

export function buildReservaContent(input: {
  variant: ControlReservaVariant
  amount: number
}): Partial<ControlReservaContent> {
  const { variant, amount } = input
  const t = i18n.t
  const money = formatMoney(amount)
  // Claves LITERALES por rama (nada de `t(\`...${var}\`)`): el guard de i18n
  // sólo verifica keys estáticas, así que una key armada por template se
  // rompería en silencio ante un typo.
  const byVariant =
    variant === 'conMeta'
      ? {
          headlinePost: t('control:neo.reserva.headlineConMeta'),
          metaCtaLabel: t('control:neo.reserva.ctaAMiMeta'),
          pose: 'zen' as const,
          brotTitle: t('control:neo.reserva.brotConMetaTitle'),
          brotPre: t('control:neo.reserva.brotConMetaPre'),
          brotPost: t('control:neo.reserva.brotConMetaPost'),
        }
      : variant === 'metaPausada'
        ? {
            headlinePost: t('control:neo.reserva.headlinePausada'),
            metaCtaLabel: t('control:neo.reserva.ctaActivarMeta'),
            pose: 'think' as const,
            brotTitle: t('control:neo.reserva.brotPausadaTitle'),
            brotPre: t('control:neo.reserva.brotPausadaPre'),
            brotPost: t('control:neo.reserva.brotPausadaPost'),
          }
        : {
            headlinePost: t('control:neo.reserva.headlineSinMeta'),
            metaCtaLabel: t('control:neo.reserva.ctaCrearMeta'),
            pose: 'think' as const,
            brotTitle: t('control:neo.reserva.brotSinMetaTitle'),
            brotPre: t('control:neo.reserva.brotSinMetaPre'),
            brotPost: t('control:neo.reserva.brotSinMetaPost'),
          }
  return {
    title: t('control:reserve.label'),
    verdictLabel: t('control:neo.reserva.pill'),
    headline: [
      { text: t('control:neo.reserva.headlinePre') },
      { text: money, tone: 'teal' },
      { text: byVariant.headlinePost },
    ],
    amount: money,
    amountCaption: t('control:neo.reserva.caption'),
    metaCtaLabel: byVariant.metaCtaLabel,
    cicloCtaLabel: t('control:neo.reserva.ctaAlCiclo'),
    brot: {
      pose: byVariant.pose,
      title: byVariant.brotTitle,
      body: [
        { text: byVariant.brotPre },
        { text: t('control:neo.reserva.brotMetaWord'), tone: 'green' },
        { text: byVariant.brotPost },
      ],
    },
  }
}
