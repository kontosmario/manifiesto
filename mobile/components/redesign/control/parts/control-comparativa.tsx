// @i18n-ignore-file — kit de rediseño bajo gate; fixtures literales del markup es-AR, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import {
  CardHeaderRow,
  ControlCard,
  GrowView,
  InsetRow,
  RadialCta,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import {
  CONTROL_RADII,
  CONTROL_SPEC,
  type ControlMode,
  type ControlSpec,
} from '@/components/redesign/control/control-spec'
import { decorativeDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * ③ Comparativa — card "CÓMO VAS ESTE MES" de la vista CONTROL.
 * Transcripción del layout final (líneas 5932–5980 del handoff pretty,
 * estado 'menos' = ESTRUCTURA DEFINITIVA a escala teléfono) + tanda CV
 * (CV-A/B/C/D, claro 3049–3282 / oscuro 3283–3520) de la que salen SOLO
 * acentos por estado, poses de Brot y copy (discrepancia [A] de
 * control-spec: las tandas dibujan la card 1–3px más grande; ganó el
 * layout final en toda medida compartida).
 *
 * Resoluciones locales (valores que el spec base no cubre — ver también
 * los const de acá abajo):
 *  · La tanda CV-B pinta el fill desbordado con
 *    `linear-gradient(90deg,#E68A5E,#C25B33)`; se usa `orangeBarCss` del
 *    spec (#E89A6E) porque el spec lo declara para "overflow comparativa"
 *    y las tandas no son fuente de gradientes compartidos.
 *  · La CTA ancha de la tanda oscura es `linear-gradient(180deg,…)` — se
 *    mantiene la radial de `RadialCta` en ambos temas (el spec documenta
 *    la CTA radial como idéntica en todo el markup de Control; el linear
 *    de la tanda es drift de iteración).
 *  · Los íconos warning/dash del pill solo existen en la tanda (12px /
 *    stroke 2.6); se normalizan a 11px / stroke 3, la escala con la que el
 *    layout final dibuja el check del mismo pill.
 *  · 'primerMes' (CV-D) no existe en el layout final: sus ritmos
 *    verticales se normalizan a los del layout final (12/13/11 en vez de
 *    14/16/13 de la tanda) y se conservan literales los elementos que solo
 *    la tanda define (título 20/900, cuerpo 12.5/700, barra placeholder
 *    38px radius 12, Brot wave 66, CTA 16/13/14).
 */

// ─── Constantes locales (no cubiertas por CONTROL_SPEC) ───────────────

/** Tinta de los labels que caen SOBRE el fill de la barra espejo ("Este
 *  mes", y "de más" en 'mas') — #F7F4E4 en ambos temas: va sobre el
 *  gradiente verde/naranja, no sobre el tema. */
const MIRROR_ON_FILL_INK = '#F7F4E4'
/** Separador de 2px en el corte de la barra espejo — layout final
 *  rgba(255,255,255,0.8) en ambos temas (la tanda dibuja 0.85; ganó el
 *  layout final). */
const MIRROR_SPLIT_INK = 'rgba(255,255,255,0.8)'
/** Sombra de la CTA ancha de la tanda CV — más profunda que el
 *  `ctaShadow` 0 6px 12px del spec (que es el de las CTAs chicas). */
const CTA_WIDE_SHADOW = '0 8px 16px rgba(46,116,52,0.35)'
/** Barra placeholder de 'primerMes' — solo existe en la tanda CV-D, por
 *  eso su radio no está en CONTROL_RADII (mirrorBar es 11, esto es otro
 *  elemento). */
const EMPTY_BAR_RADIUS = 12

// ─── Contenido por variante ───────────────────────────────────────────

export type ControlComparativaVariant = 'menos' | 'mas' | 'igual' | 'primerMes'

/** Nota de días atípicos (opcional — la dibuja la tanda CV, el layout
 *  final no). Copy por segmentos para que el número resaltado vaya en
 *  900/sub sin parsear strings. */
export interface ControlComparativaOutliers {
  /** "Días atípicos fuera del ritmo: ". */
  prefix: string
  /** "2" — va en 900 y tinta sub. */
  count: string
  /** " (suman $1,4M). Se excluyen para no inflar el cierre.". */
  suffix: string
}

/**
 * Campos de contenido. Igual que `FijosHeroContent`: tipo plano (no unión
 * discriminada) para que `ControlComparativaProps` extienda
 * `Partial<ControlComparativaContent>` y un caller pise UN campo sin
 * reconstruir la variante. 'primerMes' deja los campos de la shape
 * comparativa en `''`/`0` y viceversa.
 */
export interface ControlComparativaContent {
  // Header — las 4 variantes.
  title: string
  /** check→verde · warning→naranja · dash→sub. Ícono y tinta van SIEMPRE
   *  de a pares en las 8 cards CV del markup, por eso un solo campo. */
  verdictKind: 'check' | 'warning' | 'dash'
  verdictLabel: string
  dotTone: 'green' | 'orange' | 'faint'
  /** Solo 'menos' late (`ctlDot` en el layout final); el resto estático. */
  dotAnimated: boolean
  brotPose: BrotPose
  brotSize: number
  // Sello hundido + barra espejo + anclas — shape comparativa.
  stampLabel: string
  stampAmount: string
  /** Tiñe monto del sello, fill de la barra espejo y ancla izquierda —
   *  los tres coinciden en las 8 cards CV del markup. */
  stampAmountTone: 'green' | 'orange'
  stampDetail: string
  /** 0–100 — corte del fill de la barra espejo (59 / 100 / 98). */
  mirrorPct: number
  mirrorLeftLabel: string
  mirrorRightLabel: string
  /** true = el label derecho cae SOBRE el fill (en 'mas' el fill llega al
   *  100%) y va en tinta clara; false = sobre el track, tinta faint. */
  mirrorRightOnFill: boolean
  anchorLeft: string
  anchorRight: string
  // Fila "Donde más gastaste" — las 4 variantes.
  topCatEmoji: string
  topCatPrefix: string
  topCatName: string
  // Filas opcionales (vienen de la tanda CV; el layout final no las
  // muestra — se renderizan solo si el content las trae).
  outliers?: ControlComparativaOutliers
  ctaLabel?: string
  // 'primerMes' (CV-D) — bloque intro + barra placeholder.
  emptyTitle: string
  emptyBodyPrefix: string
  /** Monto en negrita dentro del cuerpo ("$3,9M"). */
  emptyBodyBold: string
  emptyBodySuffix: string
  emptyBarLabel: string
}

// Defaults LITERALES por variante:
//  · 'menos' → layout final (CV-A a escala teléfono): SIN nota de
//    atípicos ni CTA (el layout final no las dibuja) y ancla derecha
//    corta ("$2,7M por debajo" — la tanda decía "… de Mayo").
//  · 'mas'/'igual'/'primerMes' → tanda CV-B/C/D (única fuente): SÍ traen
//    su CTA (y la nota de atípicos en B/C) porque su card del handoff las
//    dibuja — quitarlas de los fixtures rompería "variant sola reproduce
//    la card".
export const COMPARATIVA_CONTENT: Record<ControlComparativaVariant, ControlComparativaContent> = {
  menos: {
    title: 'CÓMO VAS ESTE MES',
    verdictKind: 'check',
    verdictLabel: 'Vas bien',
    dotTone: 'green',
    dotAnimated: true,
    brotPose: 'cheer',
    brotSize: 62,
    stampLabel: 'GASTÁS MENOS QUE EN MAYO',
    stampAmount: '−$2,7M',
    stampAmountTone: 'green',
    stampDetail: '$3,9M este mes · $6,6M en Mayo',
    mirrorPct: 59,
    mirrorLeftLabel: 'Este mes',
    mirrorRightLabel: 'ahorrado',
    mirrorRightOnFill: false,
    anchorLeft: '$3,9M gastado',
    anchorRight: '$2,7M por debajo',
    topCatEmoji: '🛍️',
    topCatPrefix: 'Donde más gastaste: ',
    topCatName: 'Otros',
    emptyTitle: '',
    emptyBodyPrefix: '',
    emptyBodyBold: '',
    emptyBodySuffix: '',
    emptyBarLabel: '',
  },
  mas: {
    title: 'CÓMO VAS ESTE MES',
    verdictKind: 'warning',
    verdictLabel: 'Ojo acá',
    dotTone: 'orange',
    dotAnimated: false,
    brotPose: 'worried',
    brotSize: 62,
    stampLabel: 'GASTÁS MÁS QUE EN MAYO',
    stampAmount: '+$1,3M',
    stampAmountTone: 'orange',
    stampDetail: '$7,9M este mes · $6,6M en Mayo',
    mirrorPct: 100,
    mirrorLeftLabel: 'Este mes',
    mirrorRightLabel: 'de más',
    mirrorRightOnFill: true,
    anchorLeft: '$7,9M gastado',
    anchorRight: '$1,3M por encima de Mayo',
    topCatEmoji: '🛍️',
    topCatPrefix: 'Donde más gastaste: ',
    topCatName: 'Otros',
    outliers: {
      prefix: 'Días atípicos fuera del ritmo: ',
      count: '2',
      suffix: ' (suman $1,4M). Se excluyen para no inflar el cierre.',
    },
    ctaLabel: '▶ Ver el cierre de Mayo ›',
    emptyTitle: '',
    emptyBodyPrefix: '',
    emptyBodyBold: '',
    emptyBodySuffix: '',
    emptyBarLabel: '',
  },
  igual: {
    title: 'CÓMO VAS ESTE MES',
    verdictKind: 'dash',
    verdictLabel: 'Estable',
    dotTone: 'faint',
    dotAnimated: false,
    brotPose: 'think',
    brotSize: 62,
    stampLabel: 'CASI IGUAL QUE EN MAYO',
    stampAmount: '≈ $6,6M',
    stampAmountTone: 'green',
    stampDetail: '$6,5M este mes · $6,6M en Mayo',
    mirrorPct: 98,
    mirrorLeftLabel: 'Este mes',
    mirrorRightLabel: 'ahorrado',
    mirrorRightOnFill: false,
    anchorLeft: '$6,5M gastado',
    anchorRight: '$0,1M por debajo',
    topCatEmoji: '🛍️',
    topCatPrefix: 'Donde más gastaste: ',
    topCatName: 'Otros',
    outliers: {
      prefix: 'Días atípicos fuera del ritmo: ',
      count: '2',
      suffix: ' (suman $1,4M). Se excluyen para no inflar el cierre.',
    },
    ctaLabel: '▶ Ver el cierre de Mayo ›',
    emptyTitle: '',
    emptyBodyPrefix: '',
    emptyBodyBold: '',
    emptyBodySuffix: '',
    emptyBarLabel: '',
  },
  primerMes: {
    title: 'CÓMO VAS ESTE MES',
    verdictKind: 'dash',
    verdictLabel: 'Primer mes',
    dotTone: 'faint',
    dotAnimated: false,
    brotPose: 'wave',
    brotSize: 66,
    stampLabel: '',
    stampAmount: '',
    stampAmountTone: 'green',
    stampDetail: '',
    mirrorPct: 0,
    mirrorLeftLabel: '',
    mirrorRightLabel: '',
    mirrorRightOnFill: false,
    anchorLeft: '',
    anchorRight: '',
    topCatEmoji: '🛍️',
    topCatPrefix: 'Donde más gastaste: ',
    topCatName: 'Otros',
    ctaLabel: '▶ Ver mi mes en curso ›',
    emptyTitle: 'Tu primer mes en marcha',
    emptyBodyPrefix: 'Llevás ',
    emptyBodyBold: '$3,9M',
    emptyBodySuffix: ' gastados. El mes que viene vas a poder compararte con este.',
    emptyBarLabel: 'Todavía no hay un mes anterior para comparar',
  },
}

/** Mismo criterio que `withHeroDefaults` de fijos: `??` explícito campo
 *  por campo, así un override `false`/`0`/`''` real no se confunde con
 *  "no vino" y cada línea es su propio chequeo de tipos. */
export function withComparativaDefaults(
  variant: ControlComparativaVariant,
  overrides: Partial<ControlComparativaContent>,
): ControlComparativaContent {
  const d = COMPARATIVA_CONTENT[variant]
  return {
    title: overrides.title ?? d.title,
    verdictKind: overrides.verdictKind ?? d.verdictKind,
    verdictLabel: overrides.verdictLabel ?? d.verdictLabel,
    dotTone: overrides.dotTone ?? d.dotTone,
    dotAnimated: overrides.dotAnimated ?? d.dotAnimated,
    brotPose: overrides.brotPose ?? d.brotPose,
    brotSize: overrides.brotSize ?? d.brotSize,
    stampLabel: overrides.stampLabel ?? d.stampLabel,
    stampAmount: overrides.stampAmount ?? d.stampAmount,
    stampAmountTone: overrides.stampAmountTone ?? d.stampAmountTone,
    stampDetail: overrides.stampDetail ?? d.stampDetail,
    mirrorPct: overrides.mirrorPct ?? d.mirrorPct,
    mirrorLeftLabel: overrides.mirrorLeftLabel ?? d.mirrorLeftLabel,
    mirrorRightLabel: overrides.mirrorRightLabel ?? d.mirrorRightLabel,
    mirrorRightOnFill: overrides.mirrorRightOnFill ?? d.mirrorRightOnFill,
    anchorLeft: overrides.anchorLeft ?? d.anchorLeft,
    anchorRight: overrides.anchorRight ?? d.anchorRight,
    topCatEmoji: overrides.topCatEmoji ?? d.topCatEmoji,
    topCatPrefix: overrides.topCatPrefix ?? d.topCatPrefix,
    topCatName: overrides.topCatName ?? d.topCatName,
    // OPCIONALES por PRESENCIA, no por ??: el cableado pisa con
    // `undefined` explícito para APAGAR la fila ("sin outliers", "sin
    // CTA de cierre") — con ?? el fixture mock resucitaría como dato
    // fabricado visible (nota de días atípicos inventada, CTA muerto).
    outliers: 'outliers' in overrides ? overrides.outliers : d.outliers,
    ctaLabel: 'ctaLabel' in overrides ? overrides.ctaLabel : d.ctaLabel,
    emptyTitle: overrides.emptyTitle ?? d.emptyTitle,
    emptyBodyPrefix: overrides.emptyBodyPrefix ?? d.emptyBodyPrefix,
    emptyBodyBold: overrides.emptyBodyBold ?? d.emptyBodyBold,
    emptyBodySuffix: overrides.emptyBodySuffix ?? d.emptyBodySuffix,
    emptyBarLabel: overrides.emptyBarLabel ?? d.emptyBarLabel,
  }
}

// ─── Íconos (transcritos del markup) ──────────────────────────────────

/** Ícono del pill de veredicto. 11px / stroke 3 = escala del layout final
 *  (que solo dibuja el check; warning y dash existen solo en la tanda a
 *  12px / 2.6 y se normalizan — misma dirección que el resto de [A]).
 *  Paths literales del markup. */
function VerdictGlyph({ kind, color }: { kind: 'check' | 'warning' | 'dash'; color: string }) {
  return (
    <Svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'check' ? (
        <Path d="M5 13l4 4L19 7" />
      ) : kind === 'warning' ? (
        <>
          <Path d="M12 5v9M12 18v0.5" />
          <Path d="M12 3.5l8.5 15H3.5z" />
        </>
      ) : (
        <Path d="M5 12h14" />
      )}
    </Svg>
  )
}

/** Ícono info de la nota de días atípicos (círculo + palito + punto),
 *  literal de la tanda CV: 15px, stroke 2.2, tinta faint. */
function InfoGlyph({ color }: { color: string }) {
  // react-native-svg tipa `style` como iterable — va en array.
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} style={[styles.outliersIcon]}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5" strokeLinecap="round" />
      <Circle cx={12} cy={8} r={0.6} fill={color} />
    </Svg>
  )
}

// ─── Cuerpos por shape ────────────────────────────────────────────────

/** Shape comparativa ('menos'/'mas'/'igual'): sello hundido + Brot,
 *  barra espejo con fill animado, fila de anclas. */
function ComparativaBody({ s, c, animated }: { s: ControlSpec; c: ControlComparativaContent; animated: boolean }) {
  const toneInk = c.stampAmountTone === 'green' ? s.green : s.orange
  const fillCss = c.stampAmountTone === 'green' ? s.greenBarCss : s.orangeBarCss
  const fillFallback = c.stampAmountTone === 'green' ? s.greenBarFallback : s.orangeBarFallback
  return (
    <>
      <View style={styles.stampRow}>
        <View style={[styles.stamp, { boxShadow: s.insMd }]}>
          <Text style={[styles.stampLabel, { color: s.faint }]}>{c.stampLabel}</Text>
          <Text style={[styles.stampAmount, { color: toneInk }]}>{c.stampAmount}</Text>
          <Text style={[styles.stampDetail, { color: s.sub }]}>{c.stampDetail}</Text>
        </View>
        {/* align-items:flex-end del markup: Brot apoyado en la base del
            sello. La fila no recorta (sin overflow), Brot puede asomar. */}
        <View style={styles.stampBrotSlot}>
          <BrotMascot pose={c.brotPose} size={c.brotSize} shadow={false} animated={animated} />
        </View>
      </View>
      <View style={[styles.mirrorBar, { boxShadow: s.insMd }]}>
        <View
          style={[
            styles.mirrorTrack,
            { backgroundColor: s.neutralBarFallback, experimental_backgroundImage: s.neutralBarCss },
          ]}
        />
        <GrowView
          axis="x"
          delay={250}
          duration={decorativeDurations.growBar}
          skipEntering={!animated}
          style={[
            styles.mirrorFill,
            {
              width: `${c.mirrorPct}%`,
              backgroundColor: fillFallback,
              experimental_backgroundImage: fillCss,
            },
          ]}
        />
        {/* calc(pct% - 1px) del markup = left pct% + marginLeft -1. */}
        <View style={[styles.mirrorSplit, { left: `${c.mirrorPct}%` }]} />
        <View style={[styles.mirrorLabelSlot, styles.mirrorLabelSlotLeft]}>
          <Text style={styles.mirrorLabelOnFill}>{c.mirrorLeftLabel}</Text>
        </View>
        <View style={[styles.mirrorLabelSlot, styles.mirrorLabelSlotRight]}>
          <Text style={[styles.mirrorLabel, c.mirrorRightOnFill ? styles.mirrorLabelOnFill : { color: s.faint }]}>
            {c.mirrorRightLabel}
          </Text>
        </View>
      </View>
      <View style={styles.anchorsRow}>
        <Text style={[styles.anchorLeft, { color: toneInk }]}>{c.anchorLeft}</Text>
        <Text style={[styles.anchorRight, { color: s.sub }]}>{c.anchorRight}</Text>
      </View>
    </>
  )
}

/** Shape 'primerMes' (CV-D): intro título+cuerpo con Brot a la derecha y
 *  barra placeholder hundida en lugar de sello/espejo/anclas. */
function FirstMonthBody({ s, c, animated }: { s: ControlSpec; c: ControlComparativaContent; animated: boolean }) {
  return (
    <>
      <View style={styles.introRow}>
        <View style={styles.introTexts}>
          <Text style={[styles.introTitle, { color: s.text }]}>{c.emptyTitle}</Text>
          <Text style={[styles.introBody, { color: s.sub }]}>
            {c.emptyBodyPrefix}
            <Text style={[styles.introBodyBold, { color: s.text }]}>{c.emptyBodyBold}</Text>
            {c.emptyBodySuffix}
          </Text>
        </View>
        <BrotMascot pose={c.brotPose} size={c.brotSize} shadow={false} animated={animated} />
      </View>
      <View style={[styles.emptyBar, { boxShadow: s.insMd }]}>
        <Text style={[styles.emptyBarLabel, { color: s.faint }]}>{c.emptyBarLabel}</Text>
      </View>
    </>
  )
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlComparativaProps extends Partial<ControlComparativaContent> {
  mode: ControlMode
  /** CV-A 'menos' (default) / CV-B 'mas' / CV-C 'igual' / CV-D 'primerMes'. */
  variant?: ControlComparativaVariant
  /** false = sin loops decorativos ni entering (dot quieto, barra ya
   *  crecida, Brot estático). */
  animated?: boolean
  /** CTA ancha ("Ver el cierre de Mayo ›" / "Ver mi mes en curso ›").
   *  Solo con `ctaLabel` presente en el content hay algo que apretar. */
  onPressCierre?: () => void
  style?: StyleProp<ViewStyle>
}

export const ControlComparativa = memo(function ControlComparativa(props: ControlComparativaProps) {
  const { mode, animated = true, onPressCierre, style } = props
  const variant = props.variant ?? 'menos'
  const s = CONTROL_SPEC[mode]
  const c = withComparativaDefaults(variant, props)

  const dotColor = c.dotTone === 'green' ? s.green : c.dotTone === 'orange' ? s.orange : s.faint
  const verdictInk = c.verdictKind === 'check' ? s.green : c.verdictKind === 'warning' ? s.orange : s.sub

  return (
    <ControlCard spec={s} style={style}>
      <CardHeaderRow
        spec={s}
        dotColor={dotColor}
        dotAnimated={c.dotAnimated && animated}
        title={c.title}
        right={
          <VerdictPill
            spec={s}
            ink={verdictInk}
            label={c.verdictLabel}
            icon={<VerdictGlyph kind={c.verdictKind} color={verdictInk} />}
          />
        }
      />
      {variant === 'primerMes' ? (
        <FirstMonthBody s={s} c={c} animated={animated} />
      ) : (
        <ComparativaBody s={s} c={c} animated={animated} />
      )}
      <InsetRow spec={s} style={styles.topCatRow}>
        <Text style={styles.topCatEmoji}>{c.topCatEmoji}</Text>
        <Text numberOfLines={1} style={[styles.topCatText, { color: s.sub }]}>
          {c.topCatPrefix}
          <Text style={[styles.topCatName, { color: s.text }]}>{c.topCatName}</Text>
        </Text>
      </InsetRow>
      {c.outliers ? (
        <View style={styles.outliersRow}>
          <InfoGlyph color={s.faint} />
          <Text style={[styles.outliersText, { color: s.faint }]}>
            {c.outliers.prefix}
            <Text style={[styles.outliersCount, { color: s.sub }]}>{c.outliers.count}</Text>
            {c.outliers.suffix}
          </Text>
        </View>
      ) : null}
      {c.ctaLabel ? (
        <RadialCta
          spec={s}
          label={c.ctaLabel}
          onPress={onPressCierre}
          radius={16}
          style={[styles.wideCta, { boxShadow: CTA_WIDE_SHADOW }]}
          textStyle={styles.wideCtaLabel}
        />
      ) : null}
    </ControlCard>
  )
})

const styles = StyleSheet.create({
  // Sello hundido + Brot.
  stampRow: {
    alignItems: 'stretch',
    columnGap: 12,
    flexDirection: 'row',
    marginTop: 12,
  },
  stamp: {
    borderRadius: CONTROL_RADII.comparativaStamp,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  stampLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 9.5 * 0.08,
  },
  stampAmount: {
    fontFamily: nunitoFamily('900'),
    fontSize: 34,
    fontWeight: '900',
    // Headroom sobre el fontSize (mismo motivo que el `amount` del hero): con
    // `lineHeight == fontSize` iOS rebana el tope del `$` y de las cifras.
    lineHeight: 34 * 1.2,
    marginTop: 5,
  },
  stampDetail: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  stampBrotSlot: {
    justifyContent: 'flex-end',
  },
  // Barra espejo.
  mirrorBar: {
    borderRadius: CONTROL_RADII.mirrorBar,
    height: 34,
    marginTop: 13,
    overflow: 'hidden',
    position: 'relative',
  },
  mirrorTrack: {
    ...StyleSheet.absoluteFillObject,
  },
  mirrorFill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  mirrorSplit: {
    backgroundColor: MIRROR_SPLIT_INK,
    bottom: 0,
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  // top/bottom 0 + justifyContent center = el translateY(-50%) del markup.
  mirrorLabelSlot: {
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
  mirrorLabelSlotLeft: {
    left: 11,
  },
  mirrorLabelSlotRight: {
    right: 11,
  },
  mirrorLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11.5,
    fontWeight: '900',
  },
  mirrorLabelOnFill: {
    color: MIRROR_ON_FILL_INK,
    fontFamily: nunitoFamily('900'),
    fontSize: 11.5,
    fontWeight: '900',
  },
  // Anclas bajo la barra.
  anchorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  anchorLeft: {
    fontFamily: nunitoFamily('900'),
    fontSize: 10.5,
    fontWeight: '900',
  },
  anchorRight: {
    fontFamily: nunitoFamily('800'),
    fontSize: 10.5,
    fontWeight: '800',
  },
  // "Donde más gastaste".
  topCatRow: {
    marginTop: 11,
  },
  topCatEmoji: {
    fontSize: 13,
  },
  topCatText: {
    flexShrink: 1,
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
  },
  topCatName: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  // Nota de días atípicos (tanda CV).
  outliersRow: {
    alignItems: 'flex-start',
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 9,
    paddingHorizontal: 3,
  },
  outliersIcon: {
    marginTop: 1,
  },
  outliersText: {
    flex: 1,
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11 * 1.4,
  },
  outliersCount: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  // CTA ancha.
  wideCta: {
    marginTop: 14,
    paddingVertical: 13,
  },
  wideCtaLabel: {
    fontSize: 14,
  },
  // 'primerMes'.
  introRow: {
    alignItems: 'center',
    columnGap: 12,
    flexDirection: 'row',
    marginTop: 12,
  },
  introTexts: {
    flex: 1,
  },
  introTitle: {
    fontFamily: nunitoFamily('900'),
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 20 * 1.25,
  },
  introBody: {
    fontFamily: nunitoFamily('700'),
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 12.5 * 1.45,
    marginTop: 6,
  },
  introBodyBold: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  emptyBar: {
    borderRadius: EMPTY_BAR_RADIUS,
    height: 38,
    justifyContent: 'center',
    marginTop: 13,
    paddingHorizontal: 14,
  },
  emptyBarLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 12,
    fontWeight: '800',
  },
})
