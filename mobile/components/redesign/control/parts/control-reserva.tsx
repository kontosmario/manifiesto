// @i18n-ignore-file — kit de rediseño bajo gate; fixtures literales, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Svg, { Path, Rect } from 'react-native-svg'
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
  GhostCta,
  InsetRow,
  RadialCta,
  VerdictPill,
} from '@/components/redesign/control/control-primitives'
import { nunitoFamily } from '@/theme/typography'

/**
 * ⑨ RESERVA — card "RESERVA ACUMULADA".
 *
 * REPONE la administración de la reserva, que vivía como bloque índigo
 * dentro de la Alcancía del Control viejo
 * (`control-v2/alcancia-parts/reserve-block.tsx`) y quedó huérfana con el
 * swap de pantalla a la vista neo (9ae37db7, 2026-08-05): la plata seguía
 * guardada y visible de solo lectura en Ajustes, pero `apply_reserve_decision`
 * se quedó sin NINGÚN punto de entrada alcanzable en producción.
 *
 * POR QUÉ ES UNA CARD Y NO UN BLOQUE DENTRO DE LA ALCANCÍA, como antes:
 * `control-alcancia.tsx` es una transcripción pixel-perfect del handoff y
 * tiene gate de aprobación visual; inyectarle un bloque la rompe como
 * réplica. Además el reclamo del owner era justamente que la reserva no se
 * VE — darle su propia card con su label de sección la hace encontrable en
 * vez de esconderla dentro de otra.
 *
 * Va INMEDIATAMENTE DEBAJO de la meta/alcancía a propósito: su acción
 * principal mueve plata a esa meta, así que el destino queda a la vista
 * justo arriba (continuidad espacial de la acción).
 *
 * DECISIONES de traducción al sistema:
 *  · COLOR: el bloque viejo era índigo hardcodeado (#4F46E5 / #A5B4FC) y
 *    el design system no tiene índigo. Pasa a `spec.teal`, que ES el color
 *    de la plata apartada en Control — el tramo AHORRO del reparto y su
 *    pastilla usan teal. No es un color nuevo: es el que ya significa esto.
 *  · JERARQUÍA DE ACCIONES: el bloque viejo tenía dos botones idénticos.
 *    Acá "A una meta" es `RadialCta` (primaria) y "Sumar al ciclo" es
 *    `GhostCta` (hundida, secundaria) — una sola acción primaria por
 *    superficie. Mandarla a la meta preserva el ahorro; sumarla al ciclo lo
 *    consume, así que la que preserva manda.
 *  · TÁCTIL: ambas CTAs van con padding 11 (mismo `ctaPadFill` de la
 *    alcancía) + hitSlop 6 del primitivo → ~52pt de alto efectivo, sobre el
 *    mínimo de 44.
 *  · El monto vive en un pozo `insDeep` con dígitos tabulares: es EL dato
 *    que el usuario vino a buscar ("dónde está mi plata").
 */

// ─── Tipos de contenido ───────────────────────────────────────────────

export type ControlReservaVariant = 'conMeta' | 'sinMeta' | 'metaPausada'

export type ReservaTextTone = 'teal' | 'green' | 'ink'

export interface ReservaTextSegment {
  text: string
  tone?: ReservaTextTone
}

export interface ReservaBrot {
  pose: BrotPose
  title: string
  body: ReservaTextSegment[]
}

export interface ControlReservaContent {
  title: string
  verdictLabel: string
  headline: ReservaTextSegment[]
  /** Monto grande del pozo, ya formateado. */
  amount: string
  /** Caption bajo el monto ("de cierres anteriores"). */
  amountCaption: string
  /** Primaria: manda la reserva a la meta (o abre el wizard si no hay). */
  metaCtaLabel: string
  /** Secundaria: la suma al cupo del ciclo en curso. */
  cicloCtaLabel: string
  brot: ReservaBrot
}

// ─── Fixtures por variante ────────────────────────────────────────────

export const RESERVA_CONTENT: Record<ControlReservaVariant, ControlReservaContent> = {
  conMeta: {
    title: 'RESERVA ACUMULADA',
    verdictLabel: 'Disponible',
    headline: [
      { text: 'Tienes ' },
      { text: '$340.000', tone: 'teal' },
      { text: ' guardados aparte, sin destino asignado.' },
    ],
    amount: '$340.000',
    amountCaption: 'De cierres de ciclos anteriores',
    metaCtaLabel: 'A mi meta ›',
    cicloCtaLabel: 'Sumar al ciclo',
    brot: {
      pose: 'zen',
      title: 'Esto es tu colchón',
      body: [
        { text: 'La guardaste al cerrar ciclos anteriores. Puedes mandarla a tu ' },
        { text: 'meta', tone: 'green' },
        { text: ' o sumarla al cupo de este ciclo.' },
      ],
    },
  },
  // Hay meta pero está PAUSADA. No se puede aportar a una meta inactiva, y
  // como el hogar tiene UNA sola meta, ofrecer "crear" acá abriría el wizard
  // para pisar la que ya existe. El bloque viejo resolvía esto con un Alert
  // sin salida; acá la CTA hace lo que el Alert solo sugería: reactivarla.
  metaPausada: {
    title: 'RESERVA ACUMULADA',
    verdictLabel: 'Disponible',
    headline: [
      { text: 'Tienes ' },
      { text: '$340.000', tone: 'teal' },
      { text: ' guardados aparte, pero tu meta está pausada.' },
    ],
    amount: '$340.000',
    amountCaption: 'De cierres de ciclos anteriores',
    metaCtaLabel: 'Activar meta ›',
    cicloCtaLabel: 'Sumar al ciclo',
    brot: {
      pose: 'think',
      title: 'Tu meta está en pausa',
      body: [
        { text: 'Reactívala y vas a poder mandarle esta plata a tu ' },
        { text: 'meta', tone: 'green' },
        { text: ', o súmala ahora al cupo de este ciclo.' },
      ],
    },
  },
  sinMeta: {
    title: 'RESERVA ACUMULADA',
    verdictLabel: 'Disponible',
    headline: [
      { text: 'Tienes ' },
      { text: '$340.000', tone: 'teal' },
      { text: ' guardados aparte y todavía sin una meta adonde ir.' },
    ],
    amount: '$340.000',
    amountCaption: 'De cierres de ciclos anteriores',
    metaCtaLabel: 'Crear meta ›',
    cicloCtaLabel: 'Sumar al ciclo',
    brot: {
      pose: 'think',
      title: 'Esta plata no tiene destino',
      body: [
        { text: 'Crea una ' },
        { text: 'meta', tone: 'green' },
        { text: ' y la mando ahí directamente, o súmala al cupo de este ciclo.' },
      ],
    },
  },
}

/** Mismo criterio que el resto del kit: `??` campo por campo. Acá no hay
 *  opcionales por presencia — todos los campos son obligatorios. */
export function withReservaDefaults(
  variant: ControlReservaVariant,
  p: Partial<ControlReservaContent>,
): ControlReservaContent {
  const d = RESERVA_CONTENT[variant]
  return {
    title: p.title ?? d.title,
    verdictLabel: p.verdictLabel ?? d.verdictLabel,
    headline: p.headline ?? d.headline,
    amount: p.amount ?? d.amount,
    amountCaption: p.amountCaption ?? d.amountCaption,
    metaCtaLabel: p.metaCtaLabel ?? d.metaCtaLabel,
    cicloCtaLabel: p.cicloCtaLabel ?? d.cicloCtaLabel,
    brot: p.brot ?? d.brot,
  }
}

// ─── Glifo del pill (caja fuerte / plata apartada) ────────────────────

function VaultGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="M12 9.5v5M9.5 12h5" />
    </Svg>
  )
}

// ─── Helpers de tono ──────────────────────────────────────────────────

function toneColor(s: ControlSpec, tone?: ReservaTextTone): string | undefined {
  switch (tone) {
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

function renderSpans(s: ControlSpec, segments: ReservaTextSegment[], bold: boolean) {
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

export interface ControlReservaProps extends Partial<ControlReservaContent> {
  mode: ControlMode
  /** conMeta (hay meta activa) · sinMeta (la primaria abre el wizard). */
  variant?: ControlReservaVariant
  animated?: boolean
  /** Primaria — aportar a la meta (o crearla primero). */
  onPressMeta?: () => void
  /** Secundaria — sumar la reserva al cupo del ciclo en curso. */
  onPressCiclo?: () => void
  /** true mientras corre la mutación: apaga las dos CTAs. */
  busy?: boolean
}

export const ControlReserva = memo(function ControlReserva(props: ControlReservaProps) {
  const {
    mode,
    variant = 'conMeta',
    animated = true,
    onPressMeta,
    onPressCiclo,
    busy = false,
    ...overrides
  } = props
  const s = CONTROL_SPEC[mode]
  const c = withReservaDefaults(variant, overrides)

  return (
    <ControlCard spec={s}>
      <CardHeaderRow
        spec={s}
        dotColor={s.teal}
        title={c.title}
        right={<VerdictPill spec={s} icon={<VaultGlyph color={s.teal} />} ink={s.teal} label={c.verdictLabel} />}
      />

      <Text style={[styles.headline, { color: s.text }]}>{renderSpans(s, c.headline, false)}</Text>

      <View style={[styles.well, { boxShadow: s.insDeep }]}>
        {/* adjustsFontSizeToFit: la reserva no tiene techo — un monto de
            ocho cifras encoge en vez de partirse en dos renglones. */}
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.4}
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[styles.amount, { color: s.teal }]}
        >
          {c.amount}
        </Text>
        <Text style={[styles.amountCaption, { color: s.faint }]}>{c.amountCaption}</Text>
      </View>

      {/* El `flex: 1` va en un wrapper POR FUERA de cada CTA: la prop `style`
          de RadialCta/GhostCta aterriza en la View INTERNA, no en el
          Pressable que la envuelve, así que puesta ahí no reparte la fila
          (y el ancho saltaba al alternar `busy`). Misma trampa que documenta
          la alcancía. */}
      <View style={styles.ctaRow}>
        <View style={styles.ctaSlot}>
          <RadialCta
            label={c.metaCtaLabel}
            // El onPress se mantiene SIEMPRE: quitarlo hace que el primitivo
            // renderice una View pelada y la CTA desaparezca del árbol de
            // accesibilidad justo mientras corre la mutación. El caller
            // ignora el toque con `busy`.
            onPress={onPressMeta}
            spec={s}
            style={[styles.ctaPad, busy ? styles.ctaBusy : null]}
          />
        </View>
        <View style={styles.ctaSlot}>
          <GhostCta
            label={c.cicloCtaLabel}
            onPress={onPressCiclo}
            spec={s}
            style={[styles.ctaPad, busy ? styles.ctaBusy : null]}
          />
        </View>
      </View>

      <InsetRow spec={s} radius={CONTROL_RADII.brotChipLg} style={styles.brotRow}>
        <BrotMascot animated={animated} pose={c.brot.pose} shadow={false} size={48} />
        <View style={styles.brotCol}>
          <Text style={[styles.brotTitle, { color: s.text }]}>{c.brot.title}</Text>
          <Text style={[styles.brotBody, { color: s.sub }]}>{renderSpans(s, c.brot.body, true)}</Text>
        </View>
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
    alignItems: 'center',
    borderRadius: CONTROL_RADII.chartWell,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    rowGap: 2,
  },
  amount: {
    fontFamily: nunitoFamily('900'),
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  amountCaption: {
    fontFamily: nunitoFamily('800'),
    fontSize: 10.5,
    fontWeight: '800',
  },
  ctaRow: {
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 12,
  },
  /** El reparto de la fila vive acá, por FUERA del primitivo (ver el JSX). */
  ctaSlot: {
    flex: 1,
  },
  // padding 11 (= ctaPadFill de la alcancía) + hitSlop 6 del primitivo →
  // ~52pt de alto efectivo, sobre el mínimo táctil de 44.
  ctaPad: {
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  ctaBusy: {
    opacity: 0.45,
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
