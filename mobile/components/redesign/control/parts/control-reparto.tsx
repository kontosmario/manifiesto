// @i18n-ignore-file — kit de rediseño bajo gate; fixtures literales del markup, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
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
  RadialCta,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import { decorativeDurations } from '@/lib/motion/tokens'
import { withAlpha } from '@/theme/color-utils'
import { nunitoFamily } from '@/theme/typography'

/**
 * ⑥ REPARTO — card "TU SUELDO EN DÍAS" (design_handoff_control).
 *
 * Fuentes, en orden de autoridad (criterio [A] de control-spec: el layout
 * final gana en estructura/escala; de las tandas solo salen acentos, poses
 * de Brot y copy por estado):
 *  · Layout final (pretty l.6220–6300) → variante `sinAhorro` y TODA la
 *    métrica (headline 16.5, track 38+pad 5, tiles 15px, brot 48, chip 18,
 *    pill 12/5-10/10.5, hoy-tag 8px pad 2/7, escala 8.5/alto 14/mt 5,
 *    tiles gap 9/mt 9, chip Brot mt 12 pad 11/13 gap 11).
 *  · Tanda SD claro (l.4550–4926) → SD-A `ahorroActivo`, SD-B `fijosAltos`,
 *    SD-C `ingresoVariable`, SD-D `sinFijos`; dark l.4927–5230 y diff del
 *    teléfono l.395–508 → deltas oscuros (todos ya cubiertos por
 *    CONTROL_SPEC salvo los acentos locales de abajo).
 *
 * DECISIONES DE TRANSCRIPCIÓN (lo que el spec base no cubre):
 *  · ALTURA DEL TRACK: el markup no tiene reset global de box-sizing
 *    (verificado en el <style> del handoff), así que `height:38px` +
 *    `padding:5px` es CONTENT-box → caja visible de 48px con segmentos de
 *    38. RN es siempre border-box → acá el track mide height 48 con
 *    padding 5 (los segmentos quedan en los 38 del render real). El
 *    placeholder de `sinFijos` en cambio declara `box-sizing:border-box`
 *    explícito en el markup → sus 40px van directo.
 *  · TRAMO AHORRO (solo tandas): la tanda lo pinta a 160deg
 *    (`linear-gradient(160deg, #4FBFA9, #2E8E7C)`, dark `#59C6AE` de
 *    primer stop) mientras el layout final dibuja TODOS sus segmentos a
 *    90deg. Se deriva a 90deg conservando los stops por tema, para que el
 *    tramo conviva con `orangeBarCss`/`greenBarCss` (90deg) del spec.
 *  · MONTO DENTRO DEL SEGMENTO: el layout final lo tiñe
 *    `rgba(238,246,228,0.75)` = EXACTAMENTE el ink del label del segmento
 *    (#EEF6E4) al 75% → se generaliza como `withAlpha(ink, 0.75)` (la
 *    tanda usaba blanco 0.75; layout final ganó).
 *  · DELAYS: layout final anota fijos `.25s` y el segmento libre trae DOS
 *    `animation-delay` (`.25s` y `.32s` — en CSS gana la última: 320 ms).
 *    El tramo ahorro solo existe en la tanda (estática, sin ctlGrowX) →
 *    se intercala a 285 ms para sostener el stagger 250→320 con 3 tramos.
 *  · ÍCONOS warning/info del veredicto: solo existen en la tanda (12px,
 *    stroke 2.8). Se transcriben al tamaño del pill del layout final
 *    (11px, como el check) conservando su stroke 2.8 (el check sí es 3,
 *    literal del layout final).
 *  · `title` y el `label` de cada pastilla se agregan a Content (el brief
 *    los daba por fijos) — son copy y el cableado real los pisa vía i18n.
 *  · `scale.rightStrong` (SD-C): el "$5,3M" derecho va 900 + tinta `sub`,
 *    a diferencia del "día 30" (800 + `faint`) del resto.
 *  · La CTA del chip Brot va por `RadialCta` (radio `ctaSm`): el primitivo
 *    siempre proyecta `spec.ctaShadow` (0.3) — el layout final la dibuja
 *    sin sombra y la tanda con alpha 0.35; gana el primitivo compartido.
 *  · Sombras/overflow propios de los segmentos de la tanda
 *    (`0 3px 7px … + inset`) NO se transcriben: el layout final no los
 *    tiene (mismo criterio [A]).
 */

// ─── Acentos locales por tema (lo único del reparto que no está en
//     CONTROL_SPEC — ver docblock) ────────────────────────────────────

const REPARTO_ACCENTS: Record<ControlMode, { tealBarCss: string; placeholderBorder: string }> = {
  light: {
    tealBarCss: 'linear-gradient(90deg, #4FBFA9, #2E8E7C)',
    placeholderBorder: 'rgba(151,160,136,0.4)',
  },
  dark: {
    tealBarCss: 'linear-gradient(90deg, #59C6AE, #2E8E7C)',
    placeholderBorder: 'rgba(101,152,113,0.28)',
  },
}

const TEAL_BAR_FALLBACK = '#2E8E7C'

/** Tintas de los labels DENTRO de cada segmento — literales del markup e
 *  idénticas en ambos temas (viven sobre el gradiente, no sobre la card). */
const SEG_INK: Record<RepartoSegmentKind, string> = {
  fijos: '#FCEFE6',
  ahorro: '#E8FBF5',
  libre: '#EEF6E4',
}

// ─── Tipos de contenido ───────────────────────────────────────────────

export type ControlRepartoVariant = 'sinAhorro' | 'ahorroActivo' | 'fijosAltos' | 'ingresoVariable' | 'sinFijos'

export type RepartoTextTone = 'orange' | 'teal' | 'green' | 'ink'

/** Tramo de texto con acento opcional (headline y cuerpo del chip Brot). */
export interface RepartoTextSegment {
  text: string
  /** Sin tono = hereda el color base del bloque. `ink` = spec.text (el
   *  markup lo declara explícito en SD-C/SD-D aunque coincida con la base). */
  tone?: RepartoTextTone
}

export type RepartoVerdictTone = 'green' | 'orange' | 'faint'
export type RepartoVerdictIcon = 'check' | 'warning' | 'info'
export type RepartoSegmentKind = 'fijos' | 'ahorro' | 'libre'

export interface RepartoSegment {
  kind: RepartoSegmentKind
  /** Proporción literal del markup (días o %: 6/24, 6/5/19, 14/16, 22/78). */
  flex: number
  label: string
  /** Monto/porcentaje secundario dentro del tramo ("$5,3M", "$2,8M", "78%"). */
  sub?: string
}

export interface RepartoScaleMid {
  label: string
  /** left % literal del markup (20 / 36.7 / 46.7). */
  pos: number
  tone: 'orange' | 'teal'
}

export interface RepartoScale {
  left: string
  mid?: RepartoScaleMid
  right: string
  /** SD-C: el extremo derecho es el total ("$5,3M") — 900 + tinta sub. */
  rightStrong?: boolean
}

export interface RepartoTile {
  label: string
  value: string
  sub: string
  /** `faint` = "$0"/"sin definir" (valor Y sub en gris; además apaga el
   *  acento teal de la pastilla AHORRO). */
  valueTone: 'ink' | 'faint'
}

export interface RepartoBrot {
  pose: BrotPose
  title: string
  body: RepartoTextSegment[]
  ctaLabel?: string
}

export interface ControlRepartoContent {
  /** "TU SUELDO EN DÍAS" — copy del header, pisable por i18n. */
  title: string
  verdictLabel: string
  /** Tiñe el pill Y el dot del header (coinciden en las 10 cards del markup). */
  verdictTone: RepartoVerdictTone
  verdictIcon: RepartoVerdictIcon
  headline: RepartoTextSegment[]
  /** Marca HOY sobre el track; ausente en `ingresoVariable`/`sinFijos`
   *  (el track sube de margin-top 24 → 16 cuando falta). */
  hoyTag?: { label: string; pos: number }
  /** Vacío en `sinFijos` (sin track). */
  segments: RepartoSegment[]
  scale?: RepartoScale
  tiles?: { fijos: RepartoTile; ahorro: RepartoTile; libre: RepartoTile }
  brot: RepartoBrot
  // `sinFijos` (SD-D)
  placeholderLabel?: string
  emptyBody?: string
}

// ─── Fixtures literales por variante ──────────────────────────────────

export const REPARTO_CONTENT: Record<ControlRepartoVariant, ControlRepartoContent> = {
  // Layout final — estado sin ahorro definido.
  sinAhorro: {
    title: 'TU SUELDO EN DÍAS',
    verdictLabel: '18% fijos',
    verdictTone: 'green',
    verdictIcon: 'check',
    headline: [
      { text: 'De los 30 días, los primeros ' },
      { text: '6 pagan tus fijos', tone: 'orange' },
      { text: ' y ' },
      { text: '24 son libres', tone: 'green' },
      { text: '.' },
    ],
    hoyTag: { label: 'HOY · DÍA 18', pos: 60 },
    segments: [
      { kind: 'fijos', flex: 6, label: '6d' },
      { kind: 'libre', flex: 24, label: '24 días libres', sub: '$5,3M' },
    ],
    scale: { left: 'Día 1', mid: { label: 'día 6', pos: 20, tone: 'orange' }, right: 'día 30' },
    tiles: {
      fijos: { label: 'FIJOS', value: '$1,2M', sub: '6d · 18%', valueTone: 'ink' },
      ahorro: { label: 'AHORRO', value: '$0', sub: 'sin definir', valueTone: 'faint' },
      libre: { label: 'LIBRE', value: '$5,3M', sub: '24d · 82%', valueTone: 'ink' },
    },
    brot: {
      pose: 'think',
      title: 'Todavía no definiste cuánto ahorrar.',
      body: [{ text: 'Configurá tu ' }, { text: 'meta mensual', tone: 'green' }, { text: '.' }],
      ctaLabel: 'Definir ›',
    },
  },
  // SD-A — fijos + ahorro + libre.
  ahorroActivo: {
    title: 'TU SUELDO EN DÍAS',
    verdictLabel: 'Saludable · meta activa',
    verdictTone: 'green',
    verdictIcon: 'check',
    headline: [
      { text: '6 días', tone: 'orange' },
      { text: ' pagan tus fijos, ' },
      { text: '5 tu ahorro', tone: 'teal' },
      { text: ' y ' },
      { text: '19 quedan libres', tone: 'green' },
      { text: '.' },
    ],
    hoyTag: { label: 'HOY · DÍA 18', pos: 60 },
    segments: [
      { kind: 'fijos', flex: 6, label: '6d' },
      { kind: 'ahorro', flex: 5, label: '5d' },
      { kind: 'libre', flex: 19, label: '19 libres', sub: '$4,3M' },
    ],
    scale: { left: 'Día 1', mid: { label: 'ahorro', pos: 36.7, tone: 'teal' }, right: 'día 30' },
    tiles: {
      fijos: { label: 'FIJOS', value: '$1,2M', sub: '6d · 18%', valueTone: 'ink' },
      ahorro: { label: 'AHORRO', value: '$1,0M', sub: '5d · 16%', valueTone: 'ink' },
      libre: { label: 'LIBRE', value: '$4,3M', sub: '19d · 66%', valueTone: 'ink' },
    },
    brot: {
      pose: 'cheer',
      title: 'Tu ahorro ya está en marcha 🌱',
      body: [{ text: 'Aparto ' }, { text: '$1,0M', tone: 'teal' }, { text: ' apenas cobrás, todos los ciclos.' }],
    },
  },
  // SD-B — los fijos se comen muchos días.
  fijosAltos: {
    title: 'TU SUELDO EN DÍAS',
    verdictLabel: 'Ajustado · 42% fijos',
    verdictTone: 'orange',
    verdictIcon: 'warning',
    headline: [
      { text: 'Tus fijos se comen ' },
      { text: '14 de 30 días', tone: 'orange' },
      { text: '. Te quedan ' },
      { text: '16 libres', tone: 'green' },
      { text: '.' },
    ],
    hoyTag: { label: 'HOY · DÍA 18', pos: 60 },
    segments: [
      { kind: 'fijos', flex: 14, label: '14 días fijos', sub: '$2,8M' },
      { kind: 'libre', flex: 16, label: '16 libres' },
    ],
    scale: { left: 'Día 1', mid: { label: 'día 14', pos: 46.7, tone: 'orange' }, right: 'día 30' },
    tiles: {
      fijos: { label: 'FIJOS', value: '$2,8M', sub: '14d · 42%', valueTone: 'ink' },
      ahorro: { label: 'AHORRO', value: '$0', sub: 'sin definir', valueTone: 'faint' },
      libre: { label: 'LIBRE', value: '$3,7M', sub: '16d · 58%', valueTone: 'ink' },
    },
    brot: {
      pose: 'worried',
      title: 'Más de un tercio del mes va a fijos',
      body: [{ text: 'Revisá si hay alguno para ' }, { text: 'recortar', tone: 'green' }, { text: ' y ganá días libres.' }],
      ctaLabel: 'Ver fijos ›',
    },
  },
  // SD-C — fijos como % del último cobro (sin marca HOY).
  ingresoVariable: {
    title: 'TU SUELDO EN DÍAS',
    verdictLabel: 'Ingreso variable',
    verdictTone: 'faint',
    verdictIcon: 'info',
    headline: [
      { text: 'Cobrás ' },
      { text: 'variable', tone: 'ink' },
      { text: ', así que medimos tus fijos como parte de ' },
      { text: 'lo que entra', tone: 'green' },
      { text: '.' },
    ],
    segments: [
      { kind: 'fijos', flex: 22, label: '22%' },
      { kind: 'libre', flex: 78, label: 'libre', sub: '78%' },
    ],
    scale: { left: 'de tu último cobro', right: '$5,3M', rightStrong: true },
    tiles: {
      fijos: { label: 'FIJOS', value: '$1,2M', sub: '22% del cobro', valueTone: 'ink' },
      ahorro: { label: 'AHORRO', value: '$0', sub: 'sin definir', valueTone: 'faint' },
      libre: { label: 'LIBRE', value: '$4,1M', sub: '78% del cobro', valueTone: 'ink' },
    },
    brot: {
      pose: 'think',
      title: 'Con ingresos variables, primero los fijos',
      body: [
        { text: 'Apenas entra un cobro, aparto el ' },
        { text: '22%', tone: 'orange' },
        { text: ' de fijos y el resto queda libre.' },
      ],
    },
  },
  // SD-D — primer ciclo, sin fijos cargados (track placeholder punteado).
  sinFijos: {
    title: 'TU SUELDO EN DÍAS',
    verdictLabel: 'Sin fijos',
    verdictTone: 'faint',
    verdictIcon: 'info',
    headline: [{ text: 'Todavía no cargaste tus ' }, { text: 'fijos', tone: 'ink' }, { text: '.' }],
    segments: [],
    brot: {
      pose: 'wave',
      title: 'Empecemos por tus fijos',
      body: [{ text: 'Con 2 o 3 ya puedo armar tu reparto del ciclo.' }],
      ctaLabel: 'Agregar ›',
    },
    placeholderLabel: 'Acá vas a ver cuántos días de tu sueldo se van en fijos',
    emptyBody: 'Cargá tu alquiler, servicios y suscripciones y te muestro el reparto de tu mes en días.',
  },
}

/** Mismo criterio que `withHeroDefaults` de fijos-screen: `??` explícito
 *  campo por campo (no loop genérico, sin casts; un override `''`/`false`
 *  real no se confunde con "no vino"). Los campos-objeto (hoyTag/scale/
 *  tiles/brot) se pisan ENTEROS. */
export function withRepartoDefaults(
  variant: ControlRepartoVariant,
  p: Partial<ControlRepartoContent>,
): ControlRepartoContent {
  const d = REPARTO_CONTENT[variant]
  return {
    title: p.title ?? d.title,
    verdictLabel: p.verdictLabel ?? d.verdictLabel,
    verdictTone: p.verdictTone ?? d.verdictTone,
    verdictIcon: p.verdictIcon ?? d.verdictIcon,
    headline: p.headline ?? d.headline,
    // OPCIONALES por PRESENCIA, no por ??: el cableado apaga la marca
    // HOY / escala / tiles pasando `undefined` explícito — con ?? el
    // fixture del mock resucitaría como dato fabricado.
    hoyTag: 'hoyTag' in p ? p.hoyTag : d.hoyTag,
    segments: p.segments ?? d.segments,
    scale: 'scale' in p ? p.scale : d.scale,
    tiles: 'tiles' in p ? p.tiles : d.tiles,
    brot: p.brot ?? d.brot,
    placeholderLabel: 'placeholderLabel' in p ? p.placeholderLabel : d.placeholderLabel,
    emptyBody: 'emptyBody' in p ? p.emptyBody : d.emptyBody,
  }
}

// ─── Íconos del pill de veredicto (paths literales del markup) ────────

function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  )
}

function WarnGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5l8.5 15H3.5z" />
      <Path d="M12 9v4" />
    </Svg>
  )
}

function InfoGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 8v5" />
      <Circle cx={12} cy={16} r={0.6} fill={color} />
    </Svg>
  )
}

// ─── Helpers de tono ──────────────────────────────────────────────────

function toneColor(s: ControlSpec, tone?: RepartoTextTone): string | undefined {
  switch (tone) {
    case 'orange':
      return s.orange
    case 'teal':
      return s.teal
    case 'green':
      return s.green
    case 'ink':
      return s.text
    default:
      return undefined
  }
}

function verdictInk(s: ControlSpec, tone: RepartoVerdictTone): string {
  return tone === 'green' ? s.green : tone === 'orange' ? s.orange : s.faint
}

/** Spans del headline (heredan el 900 base) y del cuerpo del chip Brot
 *  (los acentuados suben a 900 sobre base 700 — `bold`). */
function renderSpans(s: ControlSpec, segments: RepartoTextSegment[], bold: boolean) {
  return segments.map((seg, i) => {
    const color = toneColor(s, seg.tone)
    if (color === undefined) {
      return <Text key={i}>{seg.text}</Text>
    }
    return (
      <Text key={i} style={[{ color }, bold ? styles.spanBold : null]}>
        {seg.text}
      </Text>
    )
  })
}

/** Stagger del layout final: fijos .25s, libre .32s (trae dos
 *  `animation-delay` y en CSS gana el último). El tramo ahorro no existe
 *  animado en ningún markup → 285 ms, punto medio del stagger. */
function segDelay(index: number, count: number): number {
  if (index === 0) return 250
  return index === count - 1 ? 320 : 285
}

function segFill(s: ControlSpec, tealCss: string, kind: RepartoSegmentKind): { css: string; fallback: string } {
  if (kind === 'fijos') return { css: s.orangeBarCss, fallback: s.orangeBarFallback }
  if (kind === 'ahorro') return { css: tealCss, fallback: TEAL_BAR_FALLBACK }
  return { css: s.greenBarCss, fallback: s.greenBarFallback }
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlRepartoProps extends Partial<ControlRepartoContent> {
  mode: ControlMode
  /** sinAhorro (layout final, default) · ahorroActivo (SD-A) · fijosAltos
   *  (SD-B) · ingresoVariable (SD-C) · sinFijos (SD-D). Cada variante trae
   *  sus defaults literales — pisá solo el campo que necesites. */
  variant?: ControlRepartoVariant
  /** false = sin entering de los tramos (skipEntering) y Brot quieto. */
  animated?: boolean
  /** "Definir ›" / "Ver fijos ›" / "Agregar ›" del chip Brot. */
  onPressCta?: () => void
}

export const ControlReparto = memo(function ControlReparto(props: ControlRepartoProps) {
  const { mode, variant = 'sinAhorro', animated = true, onPressCta, ...overrides } = props
  const s = CONTROL_SPEC[mode]
  const accents = REPARTO_ACCENTS[mode]
  const c = withRepartoDefaults(variant, overrides)

  const pillInk = verdictInk(s, c.verdictTone)
  const icon =
    c.verdictIcon === 'check' ? (
      <CheckGlyph color={pillInk} />
    ) : c.verdictIcon === 'warning' ? (
      <WarnGlyph color={pillInk} />
    ) : (
      <InfoGlyph color={pillInk} />
    )

  return (
    <ControlCard spec={s}>
      <CardHeaderRow
        spec={s}
        dotColor={pillInk}
        title={c.title}
        right={<VerdictPill spec={s} icon={icon} ink={pillInk} label={c.verdictLabel} />}
      />

      <Text style={[styles.headline, { color: s.text }]}>{renderSpans(s, c.headline, false)}</Text>

      {c.segments.length > 0 ? (
        // La marca HOY cuelga a top -18 → sin marca el markup achica el
        // margen a 16 (SD-C).
        <View style={c.hoyTag ? styles.trackZone : styles.trackZoneNoHoy}>
          {c.hoyTag ? (
            <View style={[styles.hoyWrap, { left: `${c.hoyTag.pos}%` }]}>
              <View style={[styles.hoyTagPill, { backgroundColor: s.hoyTagBg }]}>
                <Text numberOfLines={1} style={[styles.hoyTagLabel, { color: s.hoyTagInk }]}>
                  {c.hoyTag.label}
                </Text>
              </View>
              <View style={[styles.hoyTick, { backgroundColor: s.hoyTagBg }]} />
            </View>
          ) : null}
          <View style={[styles.track, { boxShadow: s.insDeep }]}>
            {c.segments.map((seg, i) => {
              const fill = segFill(s, accents.tealBarCss, seg.kind)
              const ink = SEG_INK[seg.kind]
              return (
                <GrowView
                  key={seg.kind}
                  axis="x"
                  delay={segDelay(i, c.segments.length)}
                  duration={decorativeDurations.growBar}
                  skipEntering={!animated}
                  style={[
                    styles.seg,
                    { backgroundColor: fill.fallback, experimental_backgroundImage: fill.css, flex: seg.flex },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.segLabel, { color: ink }]}>
                    {seg.label}
                  </Text>
                  {seg.sub !== undefined ? (
                    <Text numberOfLines={1} style={[styles.segLabel, { color: withAlpha(ink, 0.75) }]}>
                      {seg.sub}
                    </Text>
                  ) : null}
                </GrowView>
              )
            })}
          </View>
          {c.scale ? (
            <View style={styles.scaleRow}>
              <Text style={[styles.scaleSide, styles.scaleLeft, { color: s.faint }]}>{c.scale.left}</Text>
              {c.scale.mid ? (
                <Text
                  style={[
                    styles.scaleMid,
                    { color: c.scale.mid.tone === 'teal' ? s.teal : s.orange, left: `${c.scale.mid.pos}%` },
                  ]}
                >
                  {c.scale.mid.label}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.scaleSide,
                  styles.scaleRight,
                  c.scale.rightStrong ? [styles.scaleRightStrong, { color: s.sub }] : { color: s.faint },
                ]}
              >
                {c.scale.right}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {c.placeholderLabel !== undefined ? (
        <View style={[styles.placeholder, { borderColor: accents.placeholderBorder, boxShadow: s.insDeep }]}>
          <Text style={[styles.placeholderLabel, { color: s.faint }]}>{c.placeholderLabel}</Text>
        </View>
      ) : null}

      {c.emptyBody !== undefined ? (
        <Text style={[styles.emptyBody, { color: s.sub }]}>{c.emptyBody}</Text>
      ) : null}

      {c.tiles ? (
        <View style={styles.tilesRow}>
          {(['fijos', 'ahorro', 'libre'] as const).map((kind) => {
            const tile = c.tiles![kind]
            const faint = tile.valueTone === 'faint'
            // El acento (dot + label) es fijo por tramo, salvo AHORRO que
            // se apaga a gris cuando está "sin definir" ($0).
            const accent = kind === 'fijos' ? s.orange : kind === 'libre' ? s.green : faint ? s.faint : s.teal
            return (
              <View key={kind} style={[styles.tile, { boxShadow: s.insMd }]}>
                <View style={styles.tileHead}>
                  <View style={[styles.tileDot, { backgroundColor: accent }]} />
                  <Text style={[styles.tileLabel, { color: accent }]}>{tile.label}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.tileValue, { color: faint ? s.faint : s.text }]}>
                  {tile.value}
                </Text>
                <Text numberOfLines={1} style={[styles.tileSub, { color: faint ? s.faint : s.sub }]}>
                  {tile.sub}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}

      <InsetRow spec={s} radius={CONTROL_RADII.brotChipLg} style={styles.brotRow}>
        <BrotMascot animated={animated} pose={c.brot.pose} shadow={false} size={48} />
        <View style={styles.brotCol}>
          <Text style={[styles.brotTitle, { color: s.text }]}>{c.brot.title}</Text>
          <Text style={[styles.brotBody, { color: s.sub }]}>{renderSpans(s, c.brot.body, true)}</Text>
        </View>
        {c.brot.ctaLabel !== undefined ? (
          <RadialCta label={c.brot.ctaLabel} onPress={onPressCta} radius={CONTROL_RADII.ctaSm} spec={s} />
        ) : null}
      </InsetRow>
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
  spanBold: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  trackZone: {
    marginTop: 24,
  },
  trackZoneNoHoy: {
    marginTop: 16,
  },
  hoyWrap: {
    alignItems: 'center',
    position: 'absolute',
    top: -18,
    transform: [{ translateX: '-50%' }],
    zIndex: 2,
  },
  hoyTagPill: {
    borderRadius: CONTROL_RADII.hoyTag,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  hoyTagLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 8,
    fontWeight: '900',
  },
  hoyTick: {
    height: 6,
    width: 2,
  },
  // 38px de CONTENIDO + padding 5 en el markup (content-box) → 48
  // border-box en RN; los segmentos quedan en los 38 del render real.
  track: {
    borderRadius: CONTROL_RADII.repartoTrack,
    columnGap: 5,
    flexDirection: 'row',
    height: 48,
    padding: 5,
  },
  seg: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.repartoSeg,
    columnGap: 7,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  segLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    fontWeight: '900',
  },
  scaleRow: {
    height: 14,
    marginTop: 5,
  },
  scaleSide: {
    fontFamily: nunitoFamily('800'),
    fontSize: 8.5,
    fontWeight: '800',
    position: 'absolute',
  },
  scaleLeft: {
    left: 0,
  },
  scaleMid: {
    fontFamily: nunitoFamily('900'),
    fontSize: 8.5,
    fontWeight: '900',
    position: 'absolute',
    transform: [{ translateX: '-50%' }],
  },
  scaleRight: {
    right: 0,
  },
  scaleRightStrong: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  // `box-sizing:border-box` EXPLÍCITO en el markup → 40 va directo.
  placeholder: {
    alignItems: 'center',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 2,
    height: 40,
    justifyContent: 'center',
    marginTop: 16,
  },
  placeholderLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: nunitoFamily('700'),
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 12.5 * 1.45,
    marginTop: 12,
  },
  tilesRow: {
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 9,
  },
  tile: {
    borderRadius: CONTROL_RADII.statTile,
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  tileHead: {
    alignItems: 'center',
    columnGap: 5,
    flexDirection: 'row',
  },
  tileDot: {
    borderRadius: 2,
    height: 7,
    width: 7,
  },
  tileLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 9 * 0.04,
  },
  tileValue: {
    fontFamily: nunitoFamily('900'),
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
  tileSub: {
    fontFamily: nunitoFamily('800'),
    fontSize: 10,
    fontWeight: '800',
  },
  brotRow: {
    columnGap: 11,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  brotCol: {
    flex: 1,
  },
  brotTitle: {
    fontFamily: nunitoFamily('900'),
    fontSize: 12.5,
    fontWeight: '900',
  },
  brotBody: {
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
})
