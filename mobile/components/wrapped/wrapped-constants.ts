import { Dimensions } from 'react-native'
import { motionEasings } from '@/lib/motion/tokens'
import { neoInk } from '@/theme/neo-ink'
import { neoCalendar, neoTokens, type NeoShadows } from '@/theme/neo-tokens'
import { withAlpha } from '@/theme/color-utils'
import type { ResolvedThemeMode } from '@/theme/palette'

// ── Pacing tokens ────────────────────────────────────────────────────
// El Wrapped se dispara una vez al mes. No hay que apurarse — el
// usuario quiere leer. 4500ms por escena permite mirar el número,
// procesar la copy, y avanzar antes de aburrir.
export const SCENE_DURATION_MS = 4500
export const SCENE_TRANSITION_MS = 280
// CR Sprint D Minor #2: re-export desde `motionEasings.enterSmooth`
// (curva idéntica) en lugar de redeclarar la bezier. Single source of
// truth en `mobile/lib/motion/tokens.ts`.
export const EXPO_OUT = motionEasings.enterSmooth

// Stagger entrance entre OptionCards (Spec B). Solo aplica al primer
// mount de la closing scene en MODE pending.
export const OPTION_STAGGER_MS = 70
export const OPTION_ENTER_MS = 260

export const SCREEN_WIDTH = Dimensions.get('window').width

// ── Paleta de escenas ────────────────────────────────────────────────
//
// SINGLE SOURCE de los tonos del wrapped: antes cada escena declaraba sus
// hexes a mano y la pantalla de Ediciones los copiaba otra vez.
//
// Todo sale del vocabulario neumórfico. Las escenas son PANELES a sangre
// del material del sistema, así que dos reglas gobiernan la tabla:
//
//  1. El RELIEVE sigue al panel, no al tema. Un panel oscuro (`green`,
//     `deep`, `warm` en oscuro) usa las recetas de sombra oscuras en los
//     DOS temas: las claras dibujan luces blancas que sobre un verde
//     profundo se leen como un borde brillante.
//  2. La tinta apagada no es `textMuted`. Ese token da 3.3–3.9:1 sobre
//     los materiales del sistema y acá casi todo el texto secundario es
//     de 11–13px: se usa el escalón apagado FUERTE, el mismo par que el
//     resto del rediseño usa cuando el muted no llega a AA.
//
// Contrastes calculados (texto ≥4.5:1, gráfico ≥3:1), claro / oscuro:
//   paper   fg 9.24 / 14.0 · soft 5.63 / 10.5 · accent 6.55 / 12.0
//   surface fg 10.4 / 11.5 · soft 6.34 /  7.8 · accent 7.37 /  9.0
//   green   fg 8.04 /  7.6 · soft 5.87 /  5.1 · accent 7.24 /  6.0
//   warm    fg 8.29 / 11.0 · soft 5.05 /  7.5 · accent 3.79 /  6.5 (†)
//   deep    fg 11.4 / 12.2 · soft 7.98 /  7.5 · accent 10.2 /  9.6
// († el acento cálido sólo pinta cifras de 36–56px en 900 — texto grande,
//    umbral 3:1. El texto chico de esas escenas va en `foreground`.)

/** El escalón apagado que SÍ llega a AA sobre los materiales del sistema. */
const MUTED_STRONG = { light: '#3E5A44', dark: '#B9CCB2' } as const

/**
 * Fondo "excedido" del sistema en oscuro, resuelto a sólido: el token del
 * calendario es `rgba(217,115,85,0.24)` sobre `bg`, y una escena a sangre
 * necesita un color opaco para que el crossfade de fondo lo interpole.
 */
const EXCESS_DARK_SOLID = '#3F2F23'

export type WrappedToneKey = 'paper' | 'surface' | 'green' | 'warm' | 'deep'

export interface WrappedTone {
  background: string
  foreground: string
  foregroundSoft: string
  accent: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  ctaGradientCss: string
  ctaShadow: string
  ctaFg: string
  /** Pozo de la escena: barras y bloques hundidos. */
  wellBackground: string
  /** Tile EXTRUIDO sobre la escena (las cards de opción del cierre). */
  raisedBackground: string
  /** Recetas de relieve del PANEL (ver regla 1). */
  shadows: NeoShadows
  /** Fill tintado del bloque seleccionado / destacado. */
  selectedTint: string
  /** Anillo del bloque seleccionado, para el fallback sin `boxShadow`. */
  ring: string
  /** Hairline entre bloques de la misma lista. */
  divider: string
}

export function wrappedPalette(mode: ResolvedThemeMode): Record<WrappedToneKey, WrappedTone> {
  const neo = neoTokens(mode)
  const dark = neoTokens('dark')
  const ink = neoInk(mode)
  const isDark = mode === 'dark'
  const muted = MUTED_STRONG[mode]

  const cta = {
    ctaBg: neo.ctaGradient[1],
    ctaGradientCss: `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`,
    ctaShadow: neo.shadows.cta,
    ctaFg: neo.ctaText,
  }

  const onDarkPanel = {
    foreground: neo.heroText,
    foregroundSoft: neo.heroTextSoft,
    accent: neo.heroGreen,
    wellBackground: dark.well,
    // Sobre un panel oscuro el material `surface` del tema no levanta: el
    // tile se lee elevado con un velo de la propia tinta, que es lo que
    // hace el resto del rediseño en oscuro (`tileIdle`).
    raisedBackground: withAlpha(neo.heroText, 0.06),
    shadows: dark.shadows,
    selectedTint: dark.selectedTint,
    ring: dark.green,
    divider: dark.sheetDivider,
    ...cta,
  }

  const onLightPanel = {
    foreground: neo.text,
    foregroundSoft: muted,
    accent: ink.accent,
    wellBackground: neo.well,
    raisedBackground: neo.surface,
    shadows: neo.shadows,
    selectedTint: neo.selectedTint,
    ring: neo.green,
    divider: neo.sheetDivider,
    ...cta,
  }

  const withProgress = (tone: Omit<WrappedTone, 'progressTrack' | 'progressFill'>): WrappedTone => ({
    ...tone,
    progressTrack: withAlpha(tone.foreground, 0.22),
    progressFill: tone.accent,
  })

  return {
    paper: withProgress({ ...onLightPanel, background: neo.bg }),
    surface: withProgress({ ...onLightPanel, background: neo.surface }),
    // El verde profundo del sistema es el mismo en los dos temas: la
    // escena del veredicto positivo se ve igual de noche que de día, que
    // es lo que la vuelve reconocible mes a mes.
    green: withProgress({ ...onDarkPanel, background: neo.greenDeep }),
    warm: withProgress(
      isDark
        ? {
            ...onDarkPanel,
            background: EXCESS_DARK_SOLID,
            foreground: neo.text,
            foregroundSoft: muted,
            accent: neo.warm,
          }
        : {
            ...onLightPanel,
            background: neoCalendar.light.excess.bg,
            accent: ink.danger,
          },
    ),
    deep: withProgress({
      ...onDarkPanel,
      background: isDark ? neo.heroGradient[2] : neoCalendar.light.today.bg,
    }),
  }
}
