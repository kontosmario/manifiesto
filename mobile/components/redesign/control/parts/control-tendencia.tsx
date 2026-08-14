// @i18n-ignore-file — kit de rediseño; fixtures literales del markup, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { CONTROL_RADII, CONTROL_SPEC, type ControlMode, type ControlSpec } from '@/components/redesign/control/control-spec'
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
 * ControlTendencia — card "CÓMO VAN LOS ÚLTIMOS 7 DÍAS" de la vista
 * CONTROL. Transcripción del LAYOUT FINAL del handoff
 * (control-handoff-pretty.html líneas 5981–6093, teléfono claro; deltas
 * oscuro en phone-light-vs-dark.diff 111–230 — todos cubiertos por
 * CONTROL_SPEC, esta card no necesita ni un color local): barras de hoy
 * sobre la sombra de la semana previa + línea CUPO punteada + fila de
 * stats + chip de insight con Brot. La tanda "CÓMO VA · CV2" (líneas
 * 1903–3040) es una iteración ANTERIOR con otra estructura (pozo con
 * header propio, badge de promedio, leyenda, Brot adentro del pozo): de
 * ella salen SOLO veredictos, tonos, poses de Brot, stats e insights por
 * estado — nada de su geometría.
 *
 * DECISIONES (dónde el markup no alcanza y cómo se resolvió acá):
 *  · ESTADOS VACÍOS con la estructura del layout final, NO portando el
 *    bloque "Sin gastos esta semana" de la tanda vieja: `sinGastos`
 *    mantiene las 7 sombras previas y pone todas las barras de hoy en 0;
 *    `arranca` deja sin sombra previa (prev: — en la tanda) y solo 3
 *    días con dato. El pill + stats + insight ya comunican el estado —
 *    el pozo centrado con título propio de S6 era estructura vieja.
 *  · ALTURAS de barras de descendente/alza/sobreCupo/estable/arranca:
 *    el layout final solo dibuja el estado `cuidado`; se toman los px
 *    LITERALES de las barras de la tanda (chart de 60px) sin re-escalar
 *    al chart de 64 — entran, y con el cupo default (20.4 → cruza a
 *    43.6px) reproducen exactamente los stats de cada estado (alza 6/6
 *    bajo cupo, sobreCupo con el pico de 44px cruzando la línea, etc.).
 *  · El glow de HOY (`trendTodayGlow`) se gatea por `esHoy && todayH>0`
 *    en vez de "la última barra": en el layout final es equivalente (la
 *    última ES la de hoy) y evita un glow huérfano sobre una barra vacía
 *    en `arranca` (hoy es el 3er día) y `sinGastos` (hoy no tiene barra).
 *  · Labels de días sin dato (solo pasa en `arranca`) van atenuados a
 *    opacity 0.6 — mismo valor con el que la tanda atenúa sus stubs de
 *    días vacíos. "Sin dato" se deriva (prevH y todayH en 0, no esHoy),
 *    sin campo extra en el Content.
 *  · El pill del layout final usa gap:4 y la primitiva VerdictPill trae
 *    columnGap 5 (valor de los pills del hero): se pisa por style acá.
 *  · `title` y `cupoLabel` están en el Content aunque no varíen por
 *    estado, para que el view-model pueda traducirlos por props como el
 *    resto del copy.
 */

// ─── Tipos ────────────────────────────────────────────────────────────

export type ControlTendenciaVariant =
  | 'cuidado'
  | 'descendente'
  | 'alza'
  | 'sobreCupo'
  | 'estable'
  | 'arranca'
  | 'sinGastos'

/** Tonos de acento por estado — mapean a CONTROL_SPEC (muted = sub). */
export type ControlTendenciaTone = 'green' | 'orange' | 'amber' | 'muted'

/** Ícono del pill: 'trend' = SVG de línea de tendencia (layout final);
 *  down/up/warn/dash/leaf = glifos de texto de la tanda (↘ ↗ ⚠ — 🌿). */
export type ControlTendenciaVerdictIcon = 'trend' | 'down' | 'up' | 'warn' | 'dash' | 'none' | 'leaf'

export interface ControlTendenciaBar {
  label: string
  /** Altura px de la sombra de la semana previa (chart de 64). 0 = sin dato previo. */
  prevH: number
  /** Altura px de la barra de esta semana. 0 = día sin gasto / sin dato. */
  todayH: number
  /** Día de hoy: label 900 verde + glow en la barra (si tiene altura). */
  esHoy?: boolean
}

export interface ControlTendenciaStat {
  label: string
  value: string
  tone: 'text' | ControlTendenciaTone
}

export interface ControlTendenciaInsightSegment {
  text: string
  /** Con tono → 900 + color de acento (así lo dibuja el layout final). */
  tone?: 'green' | 'orange' | 'amber'
}

export interface ControlTendenciaContent {
  title: string
  verdictLabel: string
  verdictTone: ControlTendenciaTone
  verdictIcon: ControlTendenciaVerdictIcon
  /** 7 columnas del gráfico. */
  bars: ControlTendenciaBar[]
  /** Top de la línea CUPO dentro del pozo (px — 20.4 en el markup, sobre
   *  un chart de 64). El label "CUPO" se centra solo (top − 6, como el
   *  14.4 del markup). */
  cupoTopPx: number
  cupoLabel: string
  stats: {
    promedio: ControlTendenciaStat
    vsSemana: ControlTendenciaStat
    bajoCupo: ControlTendenciaStat
  }
  insight: ControlTendenciaInsightSegment[]
  brotPose: BrotPose
}

// ─── Fixtures por variante ────────────────────────────────────────────

const TITLE = 'CÓMO VAN LOS ÚLTIMOS 7 DÍAS'
const CUPO_LABEL = 'CUPO'
/** Top literal de la línea CUPO del layout final (chart de 64). */
const CUPO_TOP = 20.4

/** Barras del layout final (estado `cuidado`; `sinGastos` reusa las
 *  sombras previas con hoy en 0). */
const BARS_FINAL: ControlTendenciaBar[] = [
  { label: 'L', prevH: 41, todayH: 33 },
  { label: 'M', prevH: 38, todayH: 27 },
  { label: 'M', prevH: 64, todayH: 51 },
  { label: 'J', prevH: 41, todayH: 31 },
  { label: 'V', prevH: 47, todayH: 38 },
  { label: 'S', prevH: 51, todayH: 41 },
  { label: 'D', prevH: 39, todayH: 30, esHoy: true },
]

// Los estados de la tanda etiquetan miércoles como X y cierran en el L
// de la semana siguiente (hoy) — se transcribe tal cual, coherente con
// el insight de sobreCupo ("miércoles" = la X del pico).
export const TENDENCIA_CONTENT: Record<ControlTendenciaVariant, ControlTendenciaContent> = {
  cuidado: {
    title: TITLE,
    verdictLabel: 'Vas cuidado',
    verdictTone: 'green',
    verdictIcon: 'trend',
    bars: BARS_FINAL,
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$86k/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '−18%', tone: 'green' },
      bajoCupo: { label: 'BAJO CUPO', value: '6 de 7', tone: 'green' },
    },
    insight: [
      { text: '$1,3M/día', tone: 'green' },
      { text: ' por debajo del cupo. A este ritmo sumás al ahorro.' },
    ],
    brotPose: 'think',
  },
  descendente: {
    title: TITLE,
    verdictLabel: 'Ritmo descendente',
    verdictTone: 'green',
    verdictIcon: 'down',
    bars: [
      { label: 'L', prevH: 39, todayH: 30 },
      { label: 'M', prevH: 34, todayH: 26 },
      { label: 'X', prevH: 28, todayH: 21 },
      { label: 'J', prevH: 35, todayH: 28 },
      { label: 'V', prevH: 25, todayH: 18 },
      { label: 'S', prevH: 17, todayH: 10 },
      { label: 'L', prevH: 10, todayH: 7, esHoy: true },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$86k/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '−23%', tone: 'green' },
      bajoCupo: { label: 'BAJO CUPO', value: '6/6', tone: 'green' },
    },
    insight: [
      { text: '$1,3M/día', tone: 'green' },
      { text: ' por debajo del cupo. A este ritmo sumás ' },
      { text: '~$1,3M', tone: 'green' },
      { text: ' al cierre.' },
    ],
    brotPose: 'think',
  },
  alza: {
    title: TITLE,
    verdictLabel: 'Ritmo en alza',
    verdictTone: 'amber',
    verdictIcon: 'up',
    bars: [
      { label: 'L', prevH: 12, todayH: 14 },
      { label: 'M', prevH: 15, todayH: 18 },
      { label: 'X', prevH: 18, todayH: 22 },
      { label: 'J', prevH: 17, todayH: 20 },
      { label: 'V', prevH: 20, todayH: 27 },
      { label: 'S', prevH: 24, todayH: 31 },
      { label: 'L', prevH: 26, todayH: 33, esHoy: true },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$142k/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '+27%', tone: 'amber' },
      bajoCupo: { label: 'BAJO CUPO', value: '6/6', tone: 'green' },
    },
    insight: [
      { text: 'Vas gastando ' },
      { text: 'más que la semana pasada', tone: 'amber' },
      { text: '. Si seguís este ritmo, el sobrante baja ' },
      { text: '~$680k', tone: 'amber' },
      { text: '.' },
    ],
    brotPose: 'worried',
  },
  sobreCupo: {
    title: TITLE,
    verdictLabel: '1 día sobre cupo',
    verdictTone: 'orange',
    verdictIcon: 'warn',
    bars: [
      { label: 'L', prevH: 24, todayH: 22 },
      { label: 'M', prevH: 20, todayH: 18 },
      { label: 'X', prevH: 26, todayH: 44 },
      { label: 'J', prevH: 22, todayH: 20 },
      { label: 'V', prevH: 18, todayH: 16 },
      { label: 'S', prevH: 14, todayH: 12 },
      { label: 'L', prevH: 10, todayH: 9, esHoy: true },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$96k/día', tone: 'text' },
      // El valor va VERDE en la tanda (S3, línea 2348) aunque el pill sea
      // naranja — 5 de 6 bajo cupo sigue siendo buena noticia.
      vsSemana: { label: 'VS SEMANA', value: '−12%', tone: 'green' },
      bajoCupo: { label: 'BAJO CUPO', value: '5/6', tone: 'green' },
    },
    insight: [
      { text: 'El ' },
      { text: 'miércoles te pasaste', tone: 'orange' },
      { text: ' del cupo por $180k. Los demás días venís bien.' },
    ],
    brotPose: 'sad',
  },
  estable: {
    title: TITLE,
    verdictLabel: 'Ritmo estable',
    verdictTone: 'muted',
    verdictIcon: 'dash',
    bars: [
      { label: 'L', prevH: 20, todayH: 19 },
      { label: 'M', prevH: 20, todayH: 21 },
      { label: 'X', prevH: 21, todayH: 20 },
      { label: 'J', prevH: 19, todayH: 19 },
      { label: 'V', prevH: 21, todayH: 22 },
      { label: 'S', prevH: 20, todayH: 20 },
      { label: 'L', prevH: 20, todayH: 21, esHoy: true },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$104k/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '−', tone: 'muted' },
      bajoCupo: { label: 'BAJO CUPO', value: '6/6', tone: 'green' },
    },
    insight: [
      { text: 'Semana ' },
      { text: 'pareja', tone: 'green' },
      { text: ', casi igual que la anterior. Vas prolijo y sin sobresaltos.' },
    ],
    brotPose: 'think',
  },
  arranca: {
    title: TITLE,
    verdictLabel: 'Arranca el ciclo',
    verdictTone: 'muted',
    verdictIcon: 'none',
    bars: [
      { label: 'L', prevH: 0, todayH: 24 },
      { label: 'M', prevH: 0, todayH: 18 },
      { label: 'X', prevH: 0, todayH: 13, esHoy: true },
      { label: 'J', prevH: 0, todayH: 0 },
      { label: 'V', prevH: 0, todayH: 0 },
      { label: 'S', prevH: 0, todayH: 0 },
      { label: 'L', prevH: 0, todayH: 0 },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$78k/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '—', tone: 'muted' },
      bajoCupo: { label: 'BAJO CUPO', value: '3/3', tone: 'green' },
    },
    insight: [
      { text: 'Todavía estamos ' },
      { text: 'juntando datos', tone: 'green' },
      { text: ' de este ciclo. En unos días vas a ver tu ritmo real.' },
    ],
    brotPose: 'wave',
  },
  sinGastos: {
    title: TITLE,
    verdictLabel: 'Sin gastos aún',
    verdictTone: 'green',
    verdictIcon: 'leaf',
    bars: [
      { label: 'L', prevH: 41, todayH: 0 },
      { label: 'M', prevH: 38, todayH: 0 },
      { label: 'M', prevH: 64, todayH: 0 },
      { label: 'J', prevH: 41, todayH: 0 },
      { label: 'V', prevH: 47, todayH: 0 },
      { label: 'S', prevH: 51, todayH: 0 },
      { label: 'D', prevH: 39, todayH: 0, esHoy: true },
    ],
    cupoTopPx: CUPO_TOP,
    cupoLabel: CUPO_LABEL,
    stats: {
      promedio: { label: 'PROMEDIO', value: '$0/día', tone: 'text' },
      vsSemana: { label: 'VS SEMANA', value: '−100%', tone: 'green' },
      bajoCupo: { label: 'BAJO CUPO', value: '6/6', tone: 'green' },
    },
    insight: [
      { text: 'Cero gastos esta semana — Brot está feliz. Cada día sin gastar ' },
      { text: 'suma al frasco', tone: 'green' },
      { text: '.' },
    ],
    brotPose: 'cheer',
  },
}

/** Mismo criterio que `withHeroDefaults` de fijos: `??` explícito campo
 *  por campo (un override `''`/`0` real no se confunde con "no vino");
 *  bars/stats/insight se pisan enteros, no se mergean. */
export function withTendenciaDefaults(
  variant: ControlTendenciaVariant,
  p: Partial<ControlTendenciaContent> = {},
): ControlTendenciaContent {
  const d = TENDENCIA_CONTENT[variant]
  return {
    title: p.title ?? d.title,
    verdictLabel: p.verdictLabel ?? d.verdictLabel,
    verdictTone: p.verdictTone ?? d.verdictTone,
    verdictIcon: p.verdictIcon ?? d.verdictIcon,
    bars: p.bars ?? d.bars,
    cupoTopPx: p.cupoTopPx ?? d.cupoTopPx,
    cupoLabel: p.cupoLabel ?? d.cupoLabel,
    stats: p.stats ?? d.stats,
    insight: p.insight ?? d.insight,
    brotPose: p.brotPose ?? d.brotPose,
  }
}

// ─── Piezas internas ──────────────────────────────────────────────────

function toneColor(s: ControlSpec, tone: 'text' | ControlTendenciaTone): string {
  switch (tone) {
    case 'text':
      return s.text
    case 'green':
      return s.green
    case 'orange':
      return s.orange
    case 'amber':
      return s.amber
    case 'muted':
      return s.sub
  }
}

/** Ícono del pill. 'trend' es el SVG del layout final (viewBox/paths
 *  literales, stroke 2.8); el resto son los glifos de texto de la tanda. */
function VerdictGlyph({ icon, ink }: { icon: ControlTendenciaVerdictIcon; ink: string }) {
  if (icon === 'none') return null
  if (icon === 'trend') {
    return (
      <Svg
        width={11}
        height={11}
        viewBox="0 0 24 24"
        fill="none"
        stroke={ink}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M4 8l6 6 4-4 6 6" />
        <Path d="M20 16v-4h-4" />
      </Svg>
    )
  }
  const glyph = icon === 'down' ? '↘' : icon === 'up' ? '↗' : icon === 'warn' ? '⚠' : icon === 'dash' ? '—' : '🌿'
  return <Text style={[styles.verdictGlyph, { color: ink }]}>{glyph}</Text>
}

function StatCell({ s, stat }: { s: ControlSpec; stat: ControlTendenciaStat }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: s.faint }]}>{stat.label}</Text>
      <Text style={[styles.statValue, { color: toneColor(s, stat.tone) }]}>{stat.value}</Text>
    </View>
  )
}

// ─── ControlTendencia ─────────────────────────────────────────────────

export interface ControlTendenciaProps extends Partial<ControlTendenciaContent> {
  mode: ControlMode
  /** cuidado (default, layout final) · descendente S1 · alza S2 ·
   *  sobreCupo S3 · estable S4 · arranca S5 · sinGastos S6. */
  variant?: ControlTendenciaVariant
  /** false = sin loops decorativos (dot) ni entering de barras ni Brot
   *  animado. */
  animated?: boolean
}

export const ControlTendencia = memo(function ControlTendencia(props: ControlTendenciaProps) {
  const { mode, animated = true } = props
  const variant = props.variant ?? 'cuidado'
  const s = CONTROL_SPEC[mode]
  const c = withTendenciaDefaults(variant, props)
  const verdictInk = toneColor(s, c.verdictTone)

  return (
    <ControlCard spec={s}>
      <CardHeaderRow
        spec={s}
        dotColor={verdictInk}
        dotAnimated={animated}
        title={c.title}
        right={
          <VerdictPill
            spec={s}
            ink={verdictInk}
            label={c.verdictLabel}
            icon={<VerdictGlyph icon={c.verdictIcon} ink={verdictInk} />}
            style={styles.verdictPillGap}
          />
        }
      />

      {/* Pozo del gráfico: línea CUPO absoluta + 7 columnas. */}
      <View style={[styles.chartWell, { boxShadow: s.insDeep }]}>
        <View pointerEvents="none" style={[styles.cupoLine, { borderColor: s.cupoLine, top: c.cupoTopPx }]} />
        <Text
          style={[
            styles.cupoLabelText,
            { backgroundColor: s.cupoLabelBg, color: s.cupoLine, top: c.cupoTopPx - 6 },
          ]}
        >
          {c.cupoLabel}
        </Text>
        <View style={styles.barsRow}>
          {c.bars.map((bar, i) => {
            const sinDato = bar.prevH === 0 && bar.todayH === 0 && !bar.esHoy
            return (
              <View key={`${bar.label}-${i}`} style={styles.barCol}>
                <View style={styles.barBox}>
                  <View style={[styles.prevBar, { backgroundColor: s.trendPrevBar, height: bar.prevH }]} />
                  <GrowView
                    axis="y"
                    duration={decorativeDurations.growBarFast}
                    delay={150 + 50 * i}
                    skipEntering={!animated}
                    style={[
                      styles.todayBar,
                      {
                        backgroundColor: s.greenBarFallback,
                        experimental_backgroundImage: s.greenBarCss,
                        height: bar.todayH,
                      },
                      bar.esHoy && bar.todayH > 0 ? { boxShadow: s.trendTodayGlow } : null,
                    ]}
                  />
                </View>
                <Text
                  style={[
                    bar.esHoy ? styles.barLabelHoy : styles.barLabel,
                    { color: bar.esHoy ? s.green : s.faint },
                    sinDato ? styles.barLabelSinDato : null,
                  ]}
                >
                  {bar.label}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* Fila de stats sobre el divisor. */}
      <View style={[styles.statsRow, { borderTopColor: s.divider }]}>
        <StatCell s={s} stat={c.stats.promedio} />
        <StatCell s={s} stat={c.stats.vsSemana} />
        <StatCell s={s} stat={c.stats.bajoCupo} />
      </View>

      {/* Chip de insight con Brot. */}
      <InsetRow spec={s} radius={CONTROL_RADII.brotChip} style={styles.insightChip}>
        <View style={styles.insightBrotSlot}>
          <BrotMascot pose={c.brotPose} size={46} shadow={false} animated={animated} />
        </View>
        <Text style={[styles.insightText, { color: s.sub }]}>
          {c.insight.map((seg, i) =>
            seg.tone ? (
              <Text key={`${seg.text}-${i}`} style={[styles.insightAccent, { color: toneColor(s, seg.tone) }]}>
                {seg.text}
              </Text>
            ) : (
              <Text key={`${seg.text}-${i}`}>{seg.text}</Text>
            ),
          )}
        </Text>
      </InsetRow>
    </ControlCard>
  )
})

const styles = StyleSheet.create({
  verdictPillGap: {
    // El pill de esta card usa gap 4 (el 5 de la primitiva viene de los
    // pills del hero — ver docblock).
    columnGap: 4,
  },
  chartWell: {
    borderRadius: CONTROL_RADII.chartWell,
    marginTop: 13,
    paddingBottom: 12,
    paddingHorizontal: 13,
    paddingTop: 14,
    position: 'relative',
  },
  cupoLine: {
    borderStyle: 'dashed',
    borderTopWidth: 1.5,
    left: 13,
    position: 'absolute',
    right: 13,
  },
  cupoLabelText: {
    fontFamily: nunitoFamily('900'),
    fontSize: 8,
    fontWeight: '900',
    paddingHorizontal: 4,
    position: 'absolute',
    right: 14,
  },
  barsRow: {
    alignItems: 'flex-end',
    columnGap: 5,
    flexDirection: 'row',
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    rowGap: 6,
  },
  barBox: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  prevBar: {
    borderRadius: CONTROL_RADII.trendBar,
    bottom: 0,
    left: '10%',
    position: 'absolute',
    width: '80%',
  },
  todayBar: {
    borderRadius: CONTROL_RADII.trendBar,
    width: '54%',
  },
  barLabel: {
    fontFamily: nunitoFamily('700'),
    fontSize: 9.5,
    fontWeight: '700',
  },
  barLabelHoy: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9.5,
    fontWeight: '900',
  },
  barLabelSinDato: {
    opacity: 0.6,
  },
  statsRow: {
    alignItems: 'center',
    borderTopWidth: 1.5,
    columnGap: 12,
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 11,
  },
  statCell: {
    flex: 1,
  },
  statLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 9 * 0.06,
  },
  statValue: {
    fontFamily: nunitoFamily('900'),
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  insightChip: {
    columnGap: 11,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  insightBrotSlot: {
    flexShrink: 0,
  },
  insightText: {
    flex: 1,
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11 * 1.4,
  },
  insightAccent: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  verdictGlyph: {
    fontFamily: nunitoFamily('900'),
    fontSize: 10.5,
    fontWeight: '900',
  },
})
