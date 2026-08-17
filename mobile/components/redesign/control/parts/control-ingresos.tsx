// @i18n-ignore-file — kit de rediseño bajo gate; fixtures literales, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Svg, { Path } from 'react-native-svg'
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
  InsetRow,
  RadialCta,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import { withAlpha } from '@/theme/color-utils'
import { nunitoFamily } from '@/theme/typography'

/**
 * ⑧ INGRESOS — card "ENTRÓ ESTE CICLO".
 *
 * REPONE una card que existía en el Control viejo
 * (`control-v2/control-v2-ingresos-card.tsx`) y que el swap de pantalla
 * a la vista neo (9ae37db7, 2026-08-05) dejó sin montar: el owner perdió
 * la visión de los ingresos del ciclo. Pedido explícito de reponerla.
 *
 * A DIFERENCIA del resto del kit, esta card NO transcribe un markup del
 * handoff — `design_handoff_control` no la tiene. Se compone con los
 * primitivos ya existentes y la métrica que el resto de las cards ya
 * usa, para que entre sin desentonar:
 *  · shell `ControlCard` (radius 26, padding 15/15/14) + `CardHeaderRow`
 *    + `VerdictPill`, igual que comparativa/tendencia/hábito/reparto;
 *  · headline 16.5/900 con spans acentuados y `marginTop: 11` — la misma
 *    métrica del headline del reparto;
 *  · pozo `insDeep` para la lista (el mismo relieve que los pozos de los
 *    gráficos), filas separadas por `spec.divider`;
 *  · cierre con el chip de Brot (`InsetRow` radius `brotChipLg` + Brot 48
 *    + `RadialCta` radius `ctaSm`), calcado del pie del reparto.
 *
 * DECISIONES propias (lo que no salía de calcar):
 *  · GLIFO DEL TIPO DE INGRESO = EMOJI sobre tile teñido, no sticker. Es
 *    la convención YA establecida del sistema: la actividad del Home neo
 *    lo documenta como "Ingresos = emoji (paridad con la Home vieja:
 *    sticker solo gastos)". Inventar acá una tercera familia de íconos
 *    rompería esa consistencia. El emoji sale del catálogo central
 *    `income-kinds.ts`, que es también el que alimenta el picker.
 *  · TINTE DEL TILE derivado de `spec.green` vía withAlpha, NO del
 *    `#329315` que la Home tiene hardcodeado (y duplicado en dos
 *    archivos): así el tile sigue al tema sin sumar un color fuera del
 *    design system.
 *  · SIEMPRE VERDE. Plata que entra nunca es una alerta — el mismo
 *    criterio que traía la card vieja.
 *  · El monto NO se comprime (`flexShrink: 0`): cede el título de la
 *    fila (`minWidth: 0`), que es la trampa clásica de flex en RN.
 */

// ─── Tipos de contenido ───────────────────────────────────────────────

export type ControlIngresosVariant = 'extra' | 'variable' | 'vacio'

export type IngresosTextTone = 'green' | 'teal' | 'ink'

export interface IngresosTextSegment {
  text: string
  tone?: IngresosTextTone
}

export interface IngresosRow {
  id: string
  /** Emoji del catálogo central de tipos de ingreso. */
  glyph: string
  /** Descripción del movimiento, o el label del tipo si no tiene. */
  title: string
  /** "4 jun · Transferencia". */
  sub: string
  /** Ya formateado y con el "+" adelante. */
  amount: string
}

export interface IngresosBrot {
  pose: BrotPose
  title: string
  body: IngresosTextSegment[]
  ctaLabel?: string
}

export interface ControlIngresosContent {
  title: string
  verdictLabel: string
  verdictTone: 'green' | 'faint'
  headline: IngresosTextSegment[]
  /** Máximo 3 en el cableado real; la card no recorta por su cuenta. */
  rows: IngresosRow[]
  /** "+2 movimientos más" — ausente si no hay ocultos. */
  moreLabel?: string
  /** Solo `vacio`: pozo punteado en lugar de la lista. */
  placeholderLabel?: string
  brot: IngresosBrot
}

// ─── Fixtures por variante ────────────────────────────────────────────

export const INGRESOS_CONTENT: Record<ControlIngresosVariant, ControlIngresosContent> = {
  // Sueldo fijo + ingresos extra encima.
  extra: {
    title: 'ENTRÓ ESTE CICLO',
    verdictLabel: '+$340k · 3',
    verdictTone: 'green',
    headline: [
      { text: 'Además de tu sueldo entraron ' },
      { text: '$340.000', tone: 'green' },
      { text: ' — suman ' },
      { text: '+$11.300/día', tone: 'green' },
      { text: ' a tu cupo.' },
    ],
    rows: [
      { id: '1', glyph: '💻', title: 'Proyecto de diseño', sub: '12 ago · Freelance', amount: '+$220.000' },
      { id: '2', glyph: '🎁', title: 'Cumpleaños', sub: '7 ago · Regalo', amount: '+$80.000' },
      { id: '3', glyph: '💸', title: 'Transferencia', sub: '3 ago · Transferencia', amount: '+$40.000' },
    ],
    brot: {
      pose: 'cheer',
      title: 'Entró plata extra este ciclo',
      body: [
        { text: 'La sumé a tu cupo diario. Si quieres que no se gaste, ' },
        { text: 'mándala a tu meta', tone: 'green' },
        { text: '.' },
      ],
      ctaLabel: 'A la meta ›',
    },
  },
  // Ingreso variable: estos movimientos SON el presupuesto.
  variable: {
    title: 'ENTRÓ ESTE CICLO',
    verdictLabel: '+$340k · 3',
    verdictTone: 'green',
    headline: [
      { text: 'Entraron ' },
      { text: '$340.000', tone: 'green' },
      { text: ' este ciclo — tu presupuesto se arma con esto.' },
    ],
    rows: [
      { id: '1', glyph: '💻', title: 'Proyecto de diseño', sub: '12 ago · Freelance', amount: '+$220.000' },
      { id: '2', glyph: '🏦', title: 'Adelanto', sub: '7 ago · Sueldo extra', amount: '+$80.000' },
      { id: '3', glyph: '🏷️', title: 'Venta usada', sub: '3 ago · Venta', amount: '+$40.000' },
    ],
    brot: {
      pose: 'coach',
      title: 'Tu ciclo se arma con lo que entra',
      body: [
        { text: 'Cada cobro que cargas recalcula tu ' },
        { text: 'cupo diario', tone: 'green' },
        { text: ' al instante.' },
      ],
    },
  },
  // Ingreso variable sin cobros cargados — sin esto el Control queda mudo.
  vacio: {
    title: 'ENTRÓ ESTE CICLO',
    verdictLabel: 'Sin cobros',
    verdictTone: 'faint',
    headline: [{ text: 'Todavía no cargaste ningún ' }, { text: 'cobro', tone: 'ink' }, { text: ' en este ciclo.' }],
    rows: [],
    placeholderLabel: 'Aquí vas a ver todo lo que entró en el ciclo',
    brot: {
      pose: 'wave',
      title: 'Carga tu primer cobro',
      body: [{ text: 'Con eso ya puedo calcular tu cupo y avisarte si te estás pasando.' }],
      ctaLabel: 'Sumar ›',
    },
  },
}

/** Mismo criterio que `withRepartoDefaults`: `??` campo por campo y los
 *  opcionales por PRESENCIA (`in`), para que el cableado pueda APAGAR el
 *  "+N más" o el placeholder pasando `undefined` sin que el fixture del
 *  mock resucite como dato fabricado. */
export function withIngresosDefaults(
  variant: ControlIngresosVariant,
  p: Partial<ControlIngresosContent>,
): ControlIngresosContent {
  const d = INGRESOS_CONTENT[variant]
  return {
    title: p.title ?? d.title,
    verdictLabel: p.verdictLabel ?? d.verdictLabel,
    verdictTone: p.verdictTone ?? d.verdictTone,
    headline: p.headline ?? d.headline,
    rows: p.rows ?? d.rows,
    moreLabel: 'moreLabel' in p ? p.moreLabel : d.moreLabel,
    placeholderLabel: 'placeholderLabel' in p ? p.placeholderLabel : d.placeholderLabel,
    brot: p.brot ?? d.brot,
  }
}

// ─── Glifo del pill ───────────────────────────────────────────────────

function TrendGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 17l6-6 4 4 8-8" />
      <Path d="M15 7h6v6" />
    </Svg>
  )
}

// ─── Helpers de tono ──────────────────────────────────────────────────

function toneColor(s: ControlSpec, tone?: IngresosTextTone): string | undefined {
  switch (tone) {
    case 'green':
      return s.green
    case 'teal':
      return s.teal
    case 'ink':
      return s.text
    default:
      return undefined
  }
}

function renderSpans(s: ControlSpec, segments: IngresosTextSegment[], bold: boolean) {
  return segments.map((seg, i) => {
    const color = toneColor(s, seg.tone)
    if (color === undefined) return <Text key={i}>{seg.text}</Text>
    return (
      <Text key={i} style={[{ color }, bold ? styles.spanBold : null]}>
        {seg.text}
      </Text>
    )
  })
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlIngresosProps extends Partial<ControlIngresosContent> {
  mode: ControlMode
  /** extra (sueldo fijo + extras) · variable (el ingreso ES el presupuesto)
   *  · vacio (variable sin cobros cargados). */
  variant?: ControlIngresosVariant
  /** false = Brot quieto (reduced motion / tab sin foco). */
  animated?: boolean
  /** "A la meta ›" / "Sumar ›" del chip de Brot. */
  onPressCta?: () => void
}

export const ControlIngresos = memo(function ControlIngresos(props: ControlIngresosProps) {
  const { mode, variant = 'extra', animated = true, onPressCta, ...overrides } = props
  const s = CONTROL_SPEC[mode]
  const c = withIngresosDefaults(variant, overrides)

  const pillInk = c.verdictTone === 'green' ? s.green : s.faint
  // Tile del glifo: pastel derivado del verde del TEMA (ver docblock).
  const tileBg = withAlpha(s.green, mode === 'dark' ? 0.18 : 0.12)

  return (
    <ControlCard spec={s}>
      <CardHeaderRow
        spec={s}
        dotColor={pillInk}
        title={c.title}
        right={<VerdictPill spec={s} icon={<TrendGlyph color={pillInk} />} ink={pillInk} label={c.verdictLabel} />}
      />

      <Text style={[styles.headline, { color: s.text }]}>{renderSpans(s, c.headline, false)}</Text>

      {c.rows.length > 0 ? (
        <View style={[styles.well, { boxShadow: s.insDeep }]}>
          {c.rows.map((row, i) => (
            <View
              key={row.id}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: s.divider, borderTopWidth: StyleSheet.hairlineWidth } : null,
              ]}
            >
              <View style={[styles.glyphTile, { backgroundColor: tileBg }]}>
                {/* allowFontScaling off: el tile es de lado fijo — con la
                    escala de texto en «Máxima» el emoji lo desbordaba. */}
                <Text allowFontScaling={false} style={styles.glyph}>
                  {row.glyph}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: s.text }]}>
                  {row.title}
                </Text>
                <Text numberOfLines={1} style={[styles.rowSub, { color: s.faint }]}>
                  {row.sub}
                </Text>
              </View>
              <Text numberOfLines={1} style={[styles.rowAmount, { color: s.green }]}>
                {row.amount}
              </Text>
            </View>
          ))}
          {c.moreLabel !== undefined ? (
            <View style={[styles.moreRow, { borderTopColor: s.divider, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.moreLabel, { color: s.sub }]}>{c.moreLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {c.placeholderLabel !== undefined ? (
        <View style={[styles.placeholder, { borderColor: s.divider, boxShadow: s.insDeep }]}>
          <Text style={[styles.placeholderLabel, { color: s.faint }]}>{c.placeholderLabel}</Text>
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
  well: {
    borderRadius: CONTROL_RADII.chartWell,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  row: {
    alignItems: 'center',
    columnGap: 10,
    flexDirection: 'row',
    paddingVertical: 10,
  },
  glyphTile: {
    alignItems: 'center',
    borderRadius: 11,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  glyph: {
    fontSize: 15,
    lineHeight: 19,
  },
  rowBody: {
    flex: 1,
    // minWidth 0: sin esto el título largo empuja el monto fuera de la card.
    minWidth: 0,
    rowGap: 1,
  },
  rowTitle: {
    fontFamily: nunitoFamily('800'),
    fontSize: 12.5,
    fontWeight: '800',
  },
  rowSub: {
    fontFamily: nunitoFamily('700'),
    fontSize: 10.5,
    fontWeight: '700',
  },
  rowAmount: {
    fontFamily: nunitoFamily('900'),
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    // El monto entero se mantiene: cede el título (rowBody minWidth 0).
    flexShrink: 0,
  },
  moreRow: {
    paddingVertical: 9,
  },
  moreLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
  },
  placeholder: {
    alignItems: 'center',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 2,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  placeholderLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'center',
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
