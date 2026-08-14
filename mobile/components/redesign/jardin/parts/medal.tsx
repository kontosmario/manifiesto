// @i18n-ignore-file — pieza gráfica del kit de rediseño bajo gate; el único
// texto propio es el "?" del pozo tapado y el número del pozo en progreso
// (dato, no copy).
//
// La MEDALLA de un logro (handoff jardin 2026-08): fila de la pantalla Logros
// (HTML:1079–1215, disco 54), card "¡LOGRO DESBLOQUEADO!" del cierre (48) y
// stack solapado del acceso a Logros del jardín (34).
//
// Esta es la ÚNICA pieza que dibuja un `MedalVM`, en sus cinco ramas. El ruteo
// code→rama NO se decide acá: lo resuelve `splitLogros`
// (`@/features/achievements/achievement-progress`), el único lugar con la regla
// status→rama (§5 del plan). Este componente sólo pinta lo que le dan.
//
// ─────────────────────────────────────────────────────────────────────
// DECISIONES (D3 del plan, y lo que el plan deja abierto)
// ─────────────────────────────────────────────────────────────────────
//
//  · **El contenedor NUNCA lleva `overflow:'hidden'`.** Es el bloqueador que
//    D3 manda resolver: `iconBubble` (achievements-gallery-screen.tsx:459) y
//    `iconDisc` (badge-detail-sheet.tsx:167) lo llevan para recortar el disco
//    CUADRADO del ícono filled, y eso guillotina al Brot —su tinta sobresale
//    `BROT_INK_BLEED_TOP` unidades de la caja—. Acá el clip vive en un `<View>`
//    interno que envuelve SÓLO al ícono.
//
//  · **El ícono earned ocupa el disco entero; el bloqueado, no.** El
//    `FilledAchievementIcon` es self-contained (trae su propio disco forest),
//    así que a tamaño completo ES la cara de la medalla y el disco radial verde
//    queda como fondo + portador de la sombra. Meterlo a 0.70 sobre el radial
//    daría un círculo forest dentro de un anillo verde (una diana). El
//    bloqueado sí va a 0.70: su pozo es inset y una sombra inset la tapa
//    cualquier hijo que la cubra — sin ese aire el pozo no se leería.
//
//  · **El candado del secreto NO vive dentro del pozo.** El handoff lo dibuja
//    al borde DERECHO de la fila (HTML:1085), no dentro del disco, y un
//    candado de 15px encima de un "?" de 26px en un pozo de 54 se pisa. Se
//    exporta como `LockGlyph` para que la fila lo ubique donde va.
//
//  · **Medallas quietas por defecto** (`animated={false}`, igual que el
//    markup del handoff en las filas): en una lista de 18 el movimiento lo
//    carga el jardín, no la colección. El cierre puede pedir `animated`.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Svg, { Path, Rect } from 'react-native-svg'
import {
  AchievementIcon,
  hasAchievementIcon,
  ICON_CORAL,
  ICON_CORAL_SOFT,
  ICON_FOREST,
} from '@/components/achievements/achievement-icon'
import {
  FilledAchievementIcon,
  hasFilledAchievementIcon,
} from '@/components/achievements/achievement-icon-filled'
import { BROT_INK_BLEED_TOP, BROT_VIEWBOX_H } from '@/components/brot/brot-geometry'
import { BrotMascot } from '@/components/brot/brot-mascot'
import {
  JARDIN_GEOMETRY,
  JARDIN_SPEC,
  type JardinSpec,
} from '@/components/redesign/jardin/jardin-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type { MedalVM } from '@/features/achievements/achievement-progress'
import { cssGradient } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

/**
 * Proporciones literales del handoff sobre el disco de 54 (HTML:1085): Brot 38,
 * "?" 26, número 18. Se escalan en vez de fijar una constante por tamaño porque
 * los otros dos discos caen exactos: 48 × 38/54 = 33.8 → **34**, que es el
 * `JARDIN_GEOMETRY.cierre.medalBrot` del plan.
 */
const BROT_RATIO = 38 / 54
const GLYPH_RATIO = 26 / 54
const NUMBER_RATIO = 18 / 54

/** Sombra/fill según la superficie donde se apoya la medalla. */
export type MedalVariant = 'access' | 'cierre' | 'row'

/**
 * En oscuro el handoff cierra el radial más profundo (`#3E7D46`) en los discos
 * grandes que en el stack de 34 (`#5FA968`), y la sombra crece con el tamaño.
 * Los tres tamaños del handoff son 34 / 48 / 54, así que los cortes van al
 * medio de cada par.
 */
function variantForSize(size: number): MedalVariant {
  if (size <= 40) return 'access'
  if (size <= 50) return 'cierre'
  return 'row'
}

function raisedDisc(s: JardinSpec, variant: MedalVariant): ViewStyle {
  if (variant === 'access') {
    return {
      ...cssGradient(s.medalAccessGradientCss, s.medalAccessFallback),
      boxShadow: s.medalShadowAccess,
    }
  }
  return {
    ...cssGradient(s.medalGradientCss, s.medalFallback),
    boxShadow: variant === 'cierre' ? s.medalShadowCierre : s.medalShadowRow,
  }
}

/**
 * Los pozos se dibujan SÓLO con sombra inset y en Android < 29 esa sombra se
 * descarta en silencio: sin esto la medalla bloqueada queda como un círculo
 * plano del color de la card, indistinguible del fondo.
 */
function wellFallback(s: JardinSpec): ViewStyle | null {
  return SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline }
}

export interface MedalProps {
  vm: MedalVM
  /** Diámetro del disco: 34 (stack del jardín), 48 (cierre), 54 (fila). */
  size: number
  mode: ResolvedThemeMode
  /** Default derivado de `size`; explicitarlo sólo si se usa un tamaño nuevo. */
  variant?: MedalVariant
  /** Stack solapado del acceso a Logros: borde del color de la card. */
  bordered?: boolean
  /** Brot animado (sólo la rama `brot`). Default quieto — ver el docblock. */
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

export function Medal({
  vm,
  size,
  mode,
  variant,
  bordered = false,
  animated = false,
  style,
}: MedalProps) {
  const s = JARDIN_SPEC[mode]
  const v = variant ?? variantForSize(size)
  const shape: ViewStyle = { width: size, height: size, borderRadius: size / 2 }
  const border: ViewStyle | null = bordered
    ? { borderWidth: JARDIN_GEOMETRY.medalBorderWidth, borderColor: s.medalBorderColor }
    : null

  switch (vm.kind) {
    case 'brot': {
      const brot = Math.round(size * BROT_RATIO)
      return (
        <View style={[styles.disc, shape, raisedDisc(s, v), border, style]}>
          {/* Centrado óptico (D3): el dibujo sobresale BROT_INK_BLEED_TOP
              unidades de viewBox por arriba, así que la caja se ve corrida
              hacia arriba dentro del disco. Se compensa la MITAD del bleed,
              escalada a los px reales del Brot. */}
          <View
            style={{
              transform: [
                { translateY: (BROT_INK_BLEED_TOP / 2) * (brot / BROT_VIEWBOX_H) },
              ],
            }}
          >
            <BrotMascot pose={vm.pose} size={brot} animated={animated} shadow={false} />
          </View>
        </View>
      )
    }

    case 'icon': {
      const art = size
      const inner = vm.earned ? art : Math.round(art * BROT_RATIO)
      const iconNode = hasFilledAchievementIcon(vm.code) ? (
        <FilledAchievementIcon code={vm.code} size={inner} earned={vm.earned} />
      ) : hasAchievementIcon(vm.code) ? (
        <AchievementIcon
          code={vm.code}
          size={Math.round(inner * 0.72)}
          stroke={vm.earned ? ICON_FOREST : s.wellLockedInk}
          accent={vm.earned ? ICON_CORAL : s.wellLockedInk}
          accentSoft={vm.earned ? ICON_CORAL_SOFT : s.wellLockedInk}
        />
      ) : null

      // Un code sin arte en ningún registry (uno futuro) no puede quedar como
      // un disco vacío: cae al pozo con "?", que es exactamente "todavía no
      // tiene cara".
      if (!iconNode) {
        return renderWell(s, v, 'locked', shape, border, style, size)
      }

      const surface = vm.earned
        ? raisedDisc(s, v)
        : {
            backgroundColor: v === 'access' ? s.wellLockedBackground : s.wellProgressBackground,
            boxShadow: v === 'access' ? s.wellLockedShadow : s.wellProgressShadow,
          }

      return (
        <View
          style={[styles.disc, shape, surface, !vm.earned ? wellFallback(s) : null, border, style]}
        >
          {/* El clip va ACÁ y no en el contenedor: los íconos filled traen su
              disco forest CUADRADO y hay que recortarlo a círculo, pero el
              contenedor lo comparten con la rama `brot`, que no admite clip. */}
          <View
            style={[
              styles.clip,
              { width: inner, height: inner, borderRadius: inner / 2 },
            ]}
          >
            {iconNode}
          </View>
        </View>
      )
    }

    case 'progress':
      return renderWell(s, v, 'progress', shape, border, style, size, String(vm.current))

    case 'locked':
      return renderWell(s, v, 'locked', shape, border, style, size)

    case 'secret':
      return renderWell(s, v, 'secret', shape, border, style, size)
  }
}

/**
 * Las tres ramas de pozo comparten forma y sólo cambian tinta, fill y glifo.
 *
 * La receta del hundido va por TAMAÑO, no por rama: el handoff da un 3/6 para
 * el disco de 34 (`wellLocked*`) y un 4/9 para el de 54 (`wellProgress*`), así
 * que un `locked` grande usa la sombra del grande. Los dos fondos son el mismo
 * hex en los dos temas, por eso el fill sólo cambia en la rama secreta (que sí
 * baja un punto más).
 */
function renderWell(
  s: JardinSpec,
  variant: MedalVariant,
  kind: 'progress' | 'locked' | 'secret',
  shape: ViewStyle,
  border: ViewStyle | null,
  style: StyleProp<ViewStyle>,
  size: number,
  value?: string,
) {
  const fill =
    kind === 'secret'
      ? { backgroundColor: s.secretWellBackground, boxShadow: s.secretWellShadow }
      : kind === 'progress'
        ? { backgroundColor: s.wellProgressBackground, boxShadow: s.wellProgressShadow }
        : variant === 'access'
          ? { backgroundColor: s.wellLockedBackground, boxShadow: s.wellLockedShadow }
          : { backgroundColor: s.wellLockedBackground, boxShadow: s.wellProgressShadow }
  const ink =
    kind === 'secret' ? s.secretWellInk : kind === 'progress' ? s.wellProgressInk : s.wellLockedInk
  const text = value ?? '?'
  const fontSize = Math.round(size * (value ? NUMBER_RATIO : GLYPH_RATIO))

  return (
    <View style={[styles.disc, shape, fill, wellFallback(s), border, style]}>
      <Text style={[styles.wellText, { color: ink, fontSize }]}>{text}</Text>
    </View>
  )
}

/**
 * Candado del logro secreto — path literal del handoff (HTML:1085), el mismo
 * que fija el plan. Va al borde derecho de la fila, no dentro del pozo.
 */
export function LockGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={4} y={10} width={16} height={10} rx={2.5} />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  // SIN `overflow:'hidden'`: lo comparte la rama `brot` (D3).
  disc: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clip: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wellText: { fontWeight: '900', fontFamily: nunitoFamily('900'), textAlign: 'center' },
})
