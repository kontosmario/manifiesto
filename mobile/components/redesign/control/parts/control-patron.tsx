// @i18n-ignore-file — kit de rediseño; fixtures literales del markup (es-AR), el copy real llega por props.
import { memo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import {
  CONTROL_RADII,
  CONTROL_SPEC,
  type ControlMode,
  type ControlSpec,
} from '@/components/redesign/control/control-spec'
import {
  CardHeaderRow,
  ControlCard,
  GrowView,
  InsetRow,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import { decorativeDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * ④ HÁBITO — card "TU PATRÓN SEMANAL" (ranking de días) del rediseño de
 * Control. Transcripción del layout final (control-handoff-pretty.html
 * 6094–6219, ESTRUCTURA DEFINITIVA: columnas 66/108/38/34, headline 16.5,
 * chip de insight con Brot 44) + la tanda de estados WP (claro 3524–4040,
 * oscuro 4044–4543), de la que salen SOLO acentos por estado, poses de
 * Brot, copy de WP-B/C/D y el tip durazno — criterio [A] de control-spec.
 *
 * DECISIONES / DISCREPANCIAS resueltas acá (markup vs brief):
 *  · Copy de 'pico': gana el layout final ("es el más cuidado." /
 *    "Lo que pasa la línea PROM…"), no la versión más larga de la tanda
 *    ("es tu día más cuidado." / "Todo lo que pasa…").
 *  · Pill de veredicto de 'pico': el layout final la dibuja SIN ícono
 *    (la tanda le pone un lápiz) → `verdictIcon: 'none'`. Para
 *    pareja/findes/pocosDatos la tanda es la única fuente de ese estado,
 *    así que conservan su ícono (check / lápiz / info).
 *  · Tip durazno: el layout final NO lo dibuja (su card termina en el
 *    chip de insight); la tanda lo trae en las 4 variantes con la misma
 *    métrica que pide el brief (radius 16, padding 12/13, 11.5/700) →
 *    `tip?` opcional en Content, presente en los 4 fixtures.
 *  · WP-D trae una bajada explicativa (12.5/700 sub) que el brief no
 *    listó en Content y que no tiene versión layout-final → campo
 *    `subline?` con la métrica literal de la tanda.
 *  · 'pocosDatos' no dibuja la fila de encabezado DÍA/GASTO ni la marca
 *    PROM (ni la línea dentro de las barras): se gatea por
 *    `promPos === undefined`.
 *  · El marcador PROM del encabezado usa `left:%` +
 *    `translateX(-50%)` en CSS; en Yoga un absolute con ancho auto queda
 *    acotado por `parent − left` y el label se envolvería → caja fija de
 *    80px + marginLeft −40 (andamiaje de layout, el contenido queda
 *    centrado idéntico y desborda el pozo como en CSS).
 *  · El markup declara `animation-delay` DOS veces por barra (.25s y el
 *    escalonado 0.20–0.50s); en CSS gana la última → 200 + 50·i ms.
 *  · Los literales de estructura ("TU PATRÓN SEMANAL", DÍA, GASTO,
 *    PEOR, MEJOR) no integran Content (el brief no los lista): quedan
 *    como constantes del kit; i18n llega en el pase de cableado.
 */

// ─── Content por variante ─────────────────────────────────────────────

export type ControlPatronVariant = 'pico' | 'pareja' | 'findes' | 'pocosDatos'

/** Tramo de texto rico. `plain` hereda el estilo del contexto; el resto
 *  va 900 con su acento (`strong` = tinta principal del tema). */
export interface ControlPatronSegment {
  text: string
  tone: 'plain' | 'orange' | 'green' | 'strong'
}

export interface ControlPatronRow {
  day: string
  /** 'plain' = sub 700; orange/green = acento 900 (peor/mejor día). */
  dayTone: 'plain' | 'orange' | 'green'
  /** Ancho del fill (0–100). Sin uso cuando `dim`. */
  widthPct: number
  fill: 'orange' | 'green' | 'neutral'
  amount: string
  /** 'plain' = tinta principal 900. */
  amountTone: 'plain' | 'orange' | 'green'
  tag?: 'peor' | 'mejor'
  /** Fila sin dato (pocosDatos): día y monto en faint, pozo vacío. */
  dim?: boolean
}

export interface ControlPatronContent {
  /** "TU PATRÓN SEMANAL" — pisable por i18n (default literal del markup). */
  title?: string
  /** Encabezados de columnas y tags del ranking — pisables por i18n. */
  colDayLabel?: string
  colAmountLabel?: string
  tagWorstLabel?: string
  tagBestLabel?: string
  verdictLabel: string
  verdictTone: 'orange' | 'green' | 'faint'
  verdictIcon: 'none' | 'pencil' | 'check' | 'info'
  headline: ControlPatronSegment[]
  /** Bajada bajo el headline — solo 'pocosDatos' en el markup. */
  subline?: ControlPatronSegment[]
  /** "PROM $95k". Ausente = sin encabezado ni línea PROM (pocosDatos). */
  promLabel?: string
  /** Posición de la marca/línea PROM, 0–100 (fixture 'pico': 29.87). */
  promPos?: number
  rows: ControlPatronRow[]
  insightBrotPose: BrotPose
  insight: ControlPatronSegment[]
  tip?: ControlPatronSegment[]
}

// Fixtures LITERALES — 'pico' del layout final (WP-A es la misma escena a
// otra escala; de ahí solo su tip); 'pareja'/'findes'/'pocosDatos' de la
// tanda WP claro (los acentos mapean 1:1 a tokens del spec en oscuro,
// verificado contra la tanda dark y phone-light-vs-dark.diff 231–394).
export const PATRON_CONTENT: Record<ControlPatronVariant, ControlPatronContent> = {
  pico: {
    verdictLabel: 'Miércoles intenso',
    verdictTone: 'orange',
    verdictIcon: 'none',
    headline: [
      { text: 'El ', tone: 'plain' },
      { text: 'Miércoles', tone: 'orange' },
      { text: ' gastás ', tone: 'plain' },
      { text: '3.4× tu promedio', tone: 'orange' },
      { text: '. El ', tone: 'plain' },
      { text: 'Martes', tone: 'green' },
      { text: ' es el más cuidado.', tone: 'plain' },
    ],
    promLabel: 'PROM $95k',
    promPos: 29.87,
    rows: [
      { day: 'Miércoles', dayTone: 'orange', widthPct: 100, fill: 'orange', amount: '$318k', amountTone: 'orange', tag: 'peor' },
      { day: 'Sábado', dayTone: 'plain', widthPct: 41, fill: 'neutral', amount: '$130k', amountTone: 'plain' },
      { day: 'Viernes', dayTone: 'plain', widthPct: 35, fill: 'neutral', amount: '$110k', amountTone: 'plain' },
      { day: 'Domingo', dayTone: 'plain', widthPct: 30, fill: 'neutral', amount: '$95k', amountTone: 'plain' },
      { day: 'Jueves', dayTone: 'plain', widthPct: 29, fill: 'neutral', amount: '$92k', amountTone: 'plain' },
      { day: 'Lunes', dayTone: 'plain', widthPct: 28, fill: 'neutral', amount: '$88k', amountTone: 'plain' },
      { day: 'Martes', dayTone: 'green', widthPct: 23, fill: 'green', amount: '$74k', amountTone: 'green', tag: 'mejor' },
    ],
    insightBrotPose: 'think',
    insight: [
      { text: 'Lo que pasa la línea ', tone: 'plain' },
      { text: 'PROM', tone: 'strong' },
      { text: ' gastás de más: Miércoles, Sábado y Viernes.', tone: 'plain' },
    ],
    tip: [
      { text: 'Si bajás el Miércoles al promedio, ahorrás ', tone: 'plain' },
      { text: '~$893k', tone: 'green' },
      { text: ' este mes. ', tone: 'plain' },
      { text: 'Hoy es Miércoles', tone: 'orange' },
      { text: ' — cuidá el ritmo.', tone: 'plain' },
    ],
  },
  pareja: {
    verdictLabel: 'Semana pareja',
    verdictTone: 'green',
    verdictIcon: 'check',
    headline: [
      { text: 'Gastás ', tone: 'plain' },
      { text: 'parejo', tone: 'green' },
      { text: ' toda la semana; ningún día se dispara.', tone: 'plain' },
    ],
    promLabel: 'PROM $97k',
    promPos: 88.18,
    rows: [
      { day: 'Sábado', dayTone: 'orange', widthPct: 100, fill: 'orange', amount: '$110k', amountTone: 'orange', tag: 'peor' },
      { day: 'Viernes', dayTone: 'plain', widthPct: 95, fill: 'neutral', amount: '$104k', amountTone: 'plain' },
      { day: 'Miércoles', dayTone: 'plain', widthPct: 89, fill: 'neutral', amount: '$98k', amountTone: 'plain' },
      { day: 'Domingo', dayTone: 'plain', widthPct: 87, fill: 'neutral', amount: '$96k', amountTone: 'plain' },
      { day: 'Lunes', dayTone: 'plain', widthPct: 84, fill: 'neutral', amount: '$92k', amountTone: 'plain' },
      { day: 'Jueves', dayTone: 'plain', widthPct: 82, fill: 'neutral', amount: '$90k', amountTone: 'plain' },
      { day: 'Martes', dayTone: 'green', widthPct: 78, fill: 'green', amount: '$86k', amountTone: 'green', tag: 'mejor' },
    ],
    insightBrotPose: 'cheer',
    insight: [
      { text: 'Ninguna barra se aleja mucho de la línea ', tone: 'plain' },
      { text: 'PROM', tone: 'strong' },
      { text: ' — semana equilibrada, sin sustos.', tone: 'plain' },
    ],
    tip: [
      { text: 'Buen ritmo: no hay un día que arreglar. ', tone: 'plain' },
      { text: 'Seguí así', tone: 'green' },
      { text: ' 🌱', tone: 'plain' },
    ],
  },
  findes: {
    verdictLabel: 'Findes caros',
    verdictTone: 'orange',
    verdictIcon: 'pencil',
    headline: [
      { text: 'Los ', tone: 'plain' },
      { text: 'Sábados', tone: 'orange' },
      { text: ' gastás ', tone: 'plain' },
      { text: '2.2×', tone: 'orange' },
      { text: ' tu promedio. Entre semana venís cuidado.', tone: 'plain' },
    ],
    promLabel: 'PROM $109k',
    promPos: 45.8,
    rows: [
      { day: 'Sábado', dayTone: 'orange', widthPct: 100, fill: 'orange', amount: '$238k', amountTone: 'orange', tag: 'peor' },
      { day: 'Domingo', dayTone: 'plain', widthPct: 74, fill: 'neutral', amount: '$176k', amountTone: 'plain' },
      { day: 'Viernes', dayTone: 'plain', widthPct: 40, fill: 'neutral', amount: '$96k', amountTone: 'plain' },
      { day: 'Miércoles', dayTone: 'plain', widthPct: 29, fill: 'neutral', amount: '$70k', amountTone: 'plain' },
      { day: 'Jueves', dayTone: 'plain', widthPct: 27, fill: 'neutral', amount: '$64k', amountTone: 'plain' },
      { day: 'Lunes', dayTone: 'plain', widthPct: 26, fill: 'neutral', amount: '$62k', amountTone: 'plain' },
      { day: 'Martes', dayTone: 'green', widthPct: 23, fill: 'green', amount: '$55k', amountTone: 'green', tag: 'mejor' },
    ],
    insightBrotPose: 'worried',
    insight: [
      { text: 'Sábado y Domingo', tone: 'strong' },
      { text: ' pasan la línea PROM con holgura; de Lunes a Jueves quedás por debajo.', tone: 'plain' },
    ],
    tip: [
      { text: 'Si el finde baja al promedio, ahorrás ', tone: 'plain' },
      { text: '~$520k', tone: 'green' },
      { text: ' este mes. ', tone: 'plain' },
      { text: 'Se viene el finde', tone: 'orange' },
      { text: ' — planificá.', tone: 'plain' },
    ],
  },
  pocosDatos: {
    verdictLabel: 'Pocos datos',
    verdictTone: 'faint',
    verdictIcon: 'info',
    headline: [
      { text: 'Todavía no veo un ', tone: 'plain' },
      // Span literal del markup (mismo color que la tinta principal).
      { text: 'patrón claro', tone: 'strong' },
      { text: '.', tone: 'plain' },
    ],
    subline: [
      { text: 'Llevás ', tone: 'plain' },
      { text: '3 de 7 días', tone: 'strong' },
      { text: ' cargados esta semana. Con unos días más te muestro en qué día se te va la plata.', tone: 'plain' },
    ],
    rows: [
      { day: 'Lunes', dayTone: 'plain', widthPct: 73, fill: 'neutral', amount: '$88k', amountTone: 'plain' },
      { day: 'Martes', dayTone: 'plain', widthPct: 100, fill: 'neutral', amount: '$120k', amountTone: 'plain' },
      { day: 'Miércoles', dayTone: 'plain', widthPct: 53, fill: 'neutral', amount: '$64k', amountTone: 'plain' },
      { day: 'Jueves', dayTone: 'plain', widthPct: 0, fill: 'neutral', amount: '—', amountTone: 'plain', dim: true },
      { day: 'Viernes', dayTone: 'plain', widthPct: 0, fill: 'neutral', amount: '—', amountTone: 'plain', dim: true },
      { day: 'Sábado', dayTone: 'plain', widthPct: 0, fill: 'neutral', amount: '—', amountTone: 'plain', dim: true },
      { day: 'Domingo', dayTone: 'plain', widthPct: 0, fill: 'neutral', amount: '—', amountTone: 'plain', dim: true },
    ],
    insightBrotPose: 'wave',
    insight: [
      { text: 'Seguí registrando tus gastos del día y en breve armo tu ranking semanal 🌱', tone: 'plain' },
    ],
    tip: [
      { text: 'Cargá al menos ', tone: 'plain' },
      { text: '5 días', tone: 'strong' },
      { text: ' para ver tu peor y mejor día de la semana.', tone: 'plain' },
    ],
  },
}

/** Mismo criterio que `withHeroDefaults` de Fijos: `??` explícito campo
 *  por campo — un override `''`/`0` real no se confunde con "no vino" y
 *  cada línea es su propio chequeo de tipos. */
export function withPatronDefaults(
  variant: ControlPatronVariant,
  overrides: Partial<ControlPatronContent>,
): ControlPatronContent {
  const d = PATRON_CONTENT[variant]
  return {
    title: overrides.title ?? d.title,
    colDayLabel: overrides.colDayLabel ?? d.colDayLabel,
    colAmountLabel: overrides.colAmountLabel ?? d.colAmountLabel,
    tagWorstLabel: overrides.tagWorstLabel ?? d.tagWorstLabel,
    tagBestLabel: overrides.tagBestLabel ?? d.tagBestLabel,
    verdictLabel: overrides.verdictLabel ?? d.verdictLabel,
    verdictTone: overrides.verdictTone ?? d.verdictTone,
    verdictIcon: overrides.verdictIcon ?? d.verdictIcon,
    headline: overrides.headline ?? d.headline,
    // OPCIONALES por PRESENCIA, no por ??: el cableado apaga a propósito
    // el encabezado/línea PROM (pocosDatos) o el tip pasando `undefined`
    // explícito — con ?? el fixture del mock resucitaría.
    subline: 'subline' in overrides ? overrides.subline : d.subline,
    promLabel: 'promLabel' in overrides ? overrides.promLabel : d.promLabel,
    promPos: 'promPos' in overrides ? overrides.promPos : d.promPos,
    rows: overrides.rows ?? d.rows,
    insightBrotPose: overrides.insightBrotPose ?? d.insightBrotPose,
    insight: overrides.insight ?? d.insight,
    tip: 'tip' in overrides ? overrides.tip : d.tip,
  }
}

// ─── Piezas internas ──────────────────────────────────────────────────

/** Literales de estructura (no son Content — ver docblock). */
const PATRON_TITLE = 'TU PATRÓN SEMANAL'
const COL_DAY_LABEL = 'DÍA'
const COL_AMOUNT_LABEL = 'GASTO'
const TAG_LABEL = { peor: 'PEOR', mejor: 'MEJOR' } as const

/** `${n}%` tipado como DimensionValue (un template literal suelto infiere
 *  `string` y RN lo rechaza). */
function pct(v: number): `${number}%` {
  return `${v}%`
}

/** Íconos 11×11 de la pill de veredicto — viewBox y paths literales de la
 *  tanda WP (lápiz A/C, check B, info D). */
function VerdictIcon({ icon, color }: { icon: ControlPatronContent['verdictIcon']; color: string }) {
  switch (icon) {
    case 'pencil':
      return (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 20l4-1 10-10-3-3L5 16z" />
        </Svg>
      )
    case 'check':
      return (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 13l4 4L19 7" />
        </Svg>
      )
    case 'info':
      return (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 8v5" />
          <Circle cx={12} cy={16} r={0.6} fill={color} />
        </Svg>
      )
    default:
      return null
  }
}

/** Tramos anidados dentro de un `<Text>` padre: `plain` hereda, el resto
 *  pisa color + 900 (regla uniforme del markup en headline/insight/tip). */
function renderSegments(s: ControlSpec, segments: ControlPatronSegment[]) {
  return segments.map((seg, i) => {
    if (seg.tone === 'plain') return <Text key={i}>{seg.text}</Text>
    const color = seg.tone === 'orange' ? s.orange : seg.tone === 'green' ? s.green : s.text
    return (
      <Text key={i} style={[styles.segStrong, { color }]}>
        {seg.text}
      </Text>
    )
  })
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlPatronProps extends Partial<ControlPatronContent> {
  mode: ControlMode
  /** pico = WP-A (default, escena del layout final) · pareja = WP-B ·
   *  findes = WP-C · pocosDatos = WP-D. */
  variant?: ControlPatronVariant
  /** false = barras al estado final sin entering y Brot quieto. */
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

export const ControlPatron = memo(function ControlPatron({ mode, variant = 'pico', animated = true, style, ...overrides }: ControlPatronProps) {
  const s = CONTROL_SPEC[mode]
  const c = withPatronDefaults(variant, overrides)
  const accent = c.verdictTone === 'orange' ? s.orange : c.verdictTone === 'green' ? s.green : s.faint
  const promPos = c.promPos
  const promRing = `0 0 0 1.2px ${s.promLineRing}`

  return (
    <ControlCard spec={s} style={style}>
      <CardHeaderRow
        spec={s}
        dotColor={accent}
        title={c.title ?? PATRON_TITLE}
        right={
          <VerdictPill
            spec={s}
            ink={accent}
            label={c.verdictLabel}
            icon={<VerdictIcon icon={c.verdictIcon} color={accent} />}
          />
        }
      />

      <Text style={[styles.headline, { color: s.text }]}>{renderSegments(s, c.headline)}</Text>
      {c.subline ? <Text style={[styles.subline, { color: s.sub }]}>{renderSegments(s, c.subline)}</Text> : null}

      {/* Pozo del ranking */}
      <View style={[styles.well, { boxShadow: s.insDeep }]}>
        {promPos !== undefined ? (
          <View style={styles.colHeaderRow}>
            <Text style={[styles.colDay, { color: s.faint }]}>{c.colDayLabel ?? COL_DAY_LABEL}</Text>
            <View style={styles.promZone}>
              <View style={[styles.promMark, { left: pct(promPos) }]}>
                <Text style={[styles.promMarkLabel, { color: s.sub }]}>{c.promLabel}</Text>
                <View style={[styles.promTick, { backgroundColor: s.promLine }]} />
              </View>
            </View>
            <Text style={[styles.colAmount, { color: s.faint }]}>{c.colAmountLabel ?? COL_AMOUNT_LABEL}</Text>
            <View style={styles.tagCell} />
          </View>
        ) : null}

        <View style={styles.rankRows}>
          {c.rows.map((row, i) => {
            const dayColor = row.dim ? s.faint : row.dayTone === 'orange' ? s.orange : row.dayTone === 'green' ? s.green : s.sub
            const amountColor = row.dim ? s.faint : row.amountTone === 'orange' ? s.orange : row.amountTone === 'green' ? s.green : s.text
            const fillCss = row.fill === 'orange' ? s.orangeBarCss : row.fill === 'green' ? s.greenBarCss : s.neutralBarCss
            const fillFallback =
              row.fill === 'orange' ? s.orangeBarFallback : row.fill === 'green' ? s.greenBarFallback : s.neutralBarFallback
            return (
              <View key={i} style={styles.rankRow}>
                <Text style={[row.dim || row.dayTone === 'plain' ? styles.rankDay : styles.rankDayStrong, { color: dayColor }]}>
                  {row.day}
                </Text>
                <View style={[styles.rankBar, { boxShadow: s.insMd }]}>
                  {row.dim ? null : (
                    <GrowView
                      axis="x"
                      // Escalonado del markup: 0.20s + 0.05s por fila.
                      delay={200 + 50 * i}
                      duration={decorativeDurations.growBar}
                      skipEntering={!animated}
                      style={[
                        styles.rankFill,
                        { width: pct(row.widthPct), backgroundColor: fillFallback, experimental_backgroundImage: fillCss },
                      ]}
                    />
                  )}
                  {promPos !== undefined && !row.dim ? (
                    <View
                      style={[styles.promLine, { left: pct(promPos), backgroundColor: s.promLine, boxShadow: promRing }]}
                    />
                  ) : null}
                </View>
                <Text style={[styles.rankAmount, { color: amountColor }]}>{row.amount}</Text>
                <View style={styles.tagCell}>
                  {row.tag ? (
                    <View style={[styles.dayTag, { backgroundColor: row.tag === 'peor' ? s.tagWorstBg : s.tagBestBg }]}>
                      <Text style={[styles.dayTagLabel, { color: row.tag === 'peor' ? s.tagWorstInk : s.tagBestInk }]}>
                        {row.tag === 'peor' ? (c.tagWorstLabel ?? TAG_LABEL.peor) : (c.tagBestLabel ?? TAG_LABEL.mejor)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* Chip de insight con Brot */}
      <InsetRow spec={s} radius={CONTROL_RADII.brotChip} style={styles.insightChip}>
        <BrotMascot animated={animated} pose={c.insightBrotPose} shadow={false} size={44} />
        <Text style={[styles.insightText, { color: s.sub }]}>{renderSegments(s, c.insight)}</Text>
      </InsetRow>

      {/* Tip durazno accionable */}
      {c.tip ? (
        <View
          style={[
            styles.tipRow,
            { backgroundColor: s.tipBgFallback, experimental_backgroundImage: s.tipBgCss, boxShadow: s.tipShadow },
          ]}
        >
          <Text style={styles.tipEmoji}>💡</Text>
          <Text style={[styles.tipText, { color: s.tipInk }]}>{renderSegments(s, c.tip)}</Text>
        </View>
      ) : null}
    </ControlCard>
  )
})

const styles = StyleSheet.create({
  headline: {
    fontFamily: nunitoFamily('900'),
    fontSize: 16.5,
    fontWeight: '900',
    lineHeight: 16.5 * 1.3,
    marginTop: 11,
  },
  subline: {
    // Métrica literal de la tanda WP-D (sin versión layout-final).
    fontFamily: nunitoFamily('700'),
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 12.5 * 1.45,
    marginTop: 6,
  },
  well: {
    borderRadius: CONTROL_RADII.chartWell,
    marginTop: 12,
    padding: 13,
  },
  colHeaderRow: {
    alignItems: 'flex-end',
    columnGap: 6,
    flexDirection: 'row',
    marginBottom: 8,
  },
  colDay: {
    fontFamily: nunitoFamily('800'),
    fontSize: 9,
    fontWeight: '800',
    width: 66,
  },
  promZone: {
    height: 12,
    width: 108,
  },
  promMark: {
    alignItems: 'center',
    // Caja fija centrada sobre el ancla (ver docblock: reemplaza el
    // translateX(-50%) de CSS, que en Yoga envolvería el label).
    marginLeft: -40,
    position: 'absolute',
    top: 0,
    width: 80,
  },
  promMarkLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 7.5,
    fontWeight: '900',
  },
  promTick: {
    height: 4,
    width: 2,
  },
  colAmount: {
    fontFamily: nunitoFamily('800'),
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'right',
    width: 38,
  },
  rankRows: {
    rowGap: 9,
  },
  rankRow: {
    alignItems: 'center',
    columnGap: 6,
    flexDirection: 'row',
  },
  rankDay: {
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    width: 66,
  },
  rankDayStrong: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    fontWeight: '900',
    width: 66,
  },
  rankBar: {
    borderRadius: CONTROL_RADII.patronBar,
    height: 18,
    overflow: 'hidden',
    width: 108,
  },
  rankFill: {
    borderRadius: CONTROL_RADII.patronBar,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  promLine: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  rankAmount: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    width: 38,
  },
  tagCell: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 34,
  },
  dayTag: {
    borderRadius: CONTROL_RADII.dayTag,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  dayTagLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 8,
    fontWeight: '900',
  },
  insightChip: {
    columnGap: 10,
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  insightText: {
    flex: 1,
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11 * 1.4,
  },
  tipRow: {
    alignItems: 'flex-start',
    borderRadius: CONTROL_RADII.tipCard,
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  tipEmoji: {
    fontSize: 15,
  },
  tipText: {
    flex: 1,
    fontFamily: nunitoFamily('700'),
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 11.5 * 1.45,
  },
  segStrong: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
})
