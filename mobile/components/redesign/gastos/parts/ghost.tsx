// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior.
//
// MOLDE PUNTEADO del handoff v2 (design/gastos-2026-08-v2).
//
// La idea transversal de los vacíos EV1/EV2/EV4/EV6: donde falta dato NO va
// espacio en blanco, va el CONTORNO PUNTEADO de lo que va a venir. En EV2 el
// punteado además es load-bearing para el copy ("Los **punteados** son días que
// todavía no llegaron"), así que tiene que dibujarse de verdad.
//
// POR QUÉ SVG Y NO `borderStyle: 'dashed'`: en Android, un borde `dashed`
// combinado con `borderRadius > 0` se rinde SÓLIDO (limitación vieja y vigente
// del backend de bordes). El molde quedaría como un contorno continuo justo en
// la plataforma donde el rediseño ya pierde el neumorfismo en versiones viejas
// (ver `neoDepth` version-aware). Un `Rect` con `strokeDasharray` rinde igual
// en las dos plataformas.
//
// COSTO: `GhostOutline` monta UN nodo Svg estático (sin animación) por
// elemento. Los usos son de conteo bajo — 7 barras del hero, 3 filas fantasma,
// ≤N chips del filtro — salvo el calendario "recién arrancado", donde puede
// llegar a ~30 celdas; ahí las celdas ya montan 30 Views con sombra, así que el
// Rect estático no mueve la aguja.
import { memo, useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { GASTOS_SPEC, type GastosMode, type GastosSpec } from '@/components/redesign/gastos/gastos-spec'
import { nunitoFamily } from '@/theme/typography'

/** Trazo del molde (literal del handoff: `border:1.5px dashed …`). */
const STROKE_WIDTH = 1.5
/** Patrón del guion. El handoff usa el `dashed` del browser; 5/4 es la lectura
 *  más cercana a esa cadencia al tamaño de los moldes de Gastos. */
const DASH_ARRAY = '5 4'

/**
 * Contorno punteado que llena a su padre. Se monta como hermano absoluto
 * DENTRO del contenedor que quiere el molde (el contenedor lleva el padding y
 * el contenido; este componente solo dibuja el borde).
 */
export const GhostOutline = memo(function GhostOutline({
  stroke,
  radius,
}: {
  stroke: string
  radius: number
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout
      setSize((prev) =>
        prev && Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
          ? prev
          : { w: width, h: height },
      )
    },
    [],
  )
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size && size.w > STROKE_WIDTH && size.h > STROKE_WIDTH ? (
        <Svg width={size.w} height={size.h}>
          <Rect
            x={STROKE_WIDTH / 2}
            y={STROKE_WIDTH / 2}
            width={size.w - STROKE_WIDTH}
            height={size.h - STROKE_WIDTH}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={DASH_ARRAY}
          />
        </Svg>
      ) : null}
    </View>
  )
})

/**
 * EV1/H-4 · Barra fantasma del mini-chart de 7 días, con su letra de día
 * debajo. Sobre el forest del hero, así que usa el trazo `*OnHero` (paleta
 * única, no theme-switched).
 */
export const GhostBar = memo(function GhostBar({
  s,
  height,
  label,
}: {
  s: GastosSpec
  height: number
  label: string
}) {
  return (
    <View style={styles.ghostBarCol}>
      <View style={[styles.ghostBar, { height }]}>
        <GhostOutline stroke={s.dashStrokeOnHero} radius={4} />
      </View>
      <Text style={[styles.ghostBarLabel, { color: s.dashInkOnHero }]}>{label}</Text>
    </View>
  )
})

/** EV1/H-4 · Alturas literales del handoff (Manifiesto, EV1). */
export const GHOST_BAR_HEIGHTS = [9, 13, 10, 15, 11, 14, 10] as const
const GHOST_BAR_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Las 7 barras fantasma + sus letras (el chart lleno NO lleva letras: acá son
 *  la única pista de que el bloque es un calendario semanal). */
export function GhostWeekBars({ s }: { s: GastosSpec }) {
  return (
    <View style={styles.ghostBarRow}>
      {GHOST_BAR_HEIGHTS.map((h, i) => (
        <GhostBar key={i} s={s} height={h} label={GHOST_BAR_LABELS[i]} />
      ))}
    </View>
  )
}

/**
 * EV6/M-4 · Fila de movimiento fantasma: tile + dos líneas + monto, todo en
 * bloques sólidos `ghostFill` dentro de un contorno punteado.
 */
export const GhostMovRow = memo(function GhostMovRow({ s }: { s: GastosSpec }) {
  return (
    <View style={styles.ghostRow}>
      <GhostOutline stroke={s.dashStroke} radius={18} />
      <View style={[styles.ghostTile, { backgroundColor: s.ghostFill }]} />
      <View style={styles.ghostRowBody}>
        <View style={[styles.ghostLine1, { backgroundColor: s.ghostFill }]} />
        <View style={[styles.ghostLine2, { backgroundColor: s.ghostFill }]} />
      </View>
      <View style={[styles.ghostAmount, { backgroundColor: s.ghostFill }]} />
    </View>
  )
})

/**
 * EV4/F-3 · Chip de categoría fantasma: la categoría existe en el catálogo
 * pero todavía no tiene movimientos, así que va punteada y SIN contador (un
 * "0" leería como dato; el molde lee como promesa).
 */
export const GhostChip = memo(function GhostChip({
  s,
  label,
}: {
  s: GastosSpec
  label: string
}) {
  return (
    <View style={styles.ghostChip}>
      <GhostOutline stroke={s.dashStroke} radius={16} />
      <Text numberOfLines={1} style={[styles.ghostChipLabel, { color: s.dashInk }]}>
        {label}
      </Text>
    </View>
  )
})

/**
 * Pill de estado a la derecha de un eyebrow (F-1…F-4, M-4). `tone`:
 * `data` = hay dato (verde) · `muted` = todavía sin usar · `alert` = el filtro
 * dejó la vista sin resultados.
 */
export const StatusPill = memo(function StatusPill({
  mode,
  label,
  tone = 'data',
}: {
  mode: GastosMode
  label: string
  tone?: 'data' | 'muted' | 'alert'
}) {
  const s = GASTOS_SPEC[mode]
  const ink =
    tone === 'muted' ? s.statusPillMutedInk : tone === 'alert' ? s.statusPillAlertInk : s.statusPillInk
  return (
    <View style={[styles.statusPill, { boxShadow: s.statusPillShadow }]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.statusPillText, { color: ink }]}>
        {label}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  // ─── Barras fantasma del hero (EV1) ───
  ghostBarRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', marginLeft: 14, gap: 4 },
  ghostBarCol: { flex: 1, alignItems: 'center', gap: 5 },
  ghostBar: { width: '62%', borderRadius: 4 },
  ghostBarLabel: { fontSize: 8, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ─── Fila de movimiento fantasma (EV6) ───
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  ghostTile: { width: 38, height: 38, borderRadius: 13, flexShrink: 0 },
  ghostRowBody: { flex: 1 },
  ghostLine1: { height: 9, width: '52%', borderRadius: 5 },
  ghostLine2: { height: 8, width: '34%', borderRadius: 4, marginTop: 6 },
  ghostAmount: { height: 10, width: 46, borderRadius: 5, flexShrink: 0 },

  // ─── Chip fantasma (EV4) ───
  ghostChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  ghostChipLabel: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ─── Pill de estado ───
  statusPill: { flexShrink: 0, borderRadius: 11, paddingVertical: 4, paddingHorizontal: 9 },
  statusPillText: { fontSize: 9.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
})
