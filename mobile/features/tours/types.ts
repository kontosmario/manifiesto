import type { RefObject } from 'react'
import type { View } from 'react-native'
import type { TourKey } from './tour-keys'

/**
 * Per-step highlight customization. All fields optional with sane
 * defaults pulled from theme tokens at render time.
 */
export interface HighlightStyle {
  /** Extra padding around the target rect. Default: 6pt. */
  padding?: number
  /**
   * Override the cutout's border radius. If unspecified the host
   * tries to read the target's own borderRadius via measure +
   * sensible fallback (16pt).
   */
  borderRadius?: number
  /** Outline drawn around the highlight cutout. Default: none. */
  borderColor?: string
  /** Outline width. Default: 0 (no border). */
  borderWidth?: number
  /** Show a looping pulse halo around the highlight. Default: false. */
  pulse?: boolean
  /** Pulse halo color. Default: theme.colors.primary. */
  pulseColor?: string
  /** Pulse stroke width. Default: 3. */
  pulseWidth?: number
  /**
   * When true, the cutout's bottom edge is stretched down to the
   * scroll surface's bottom (instead of `target.y + target.height`).
   * Useful for "highlight everything from this anchor onward" steps,
   * e.g. the gastos tour's `list` step which anchors at the
   * "Movimientos" title and should cover all the rows that follow,
   * even though those rows live in a separate virtualized region
   * outside the anchor element's bounds.
   *
   * Requires a registered scroll surface (otherwise the host has no
   * "bottom" to stretch to and the flag is a no-op).
   */
  extendToScrollEnd?: boolean
  /**
   * Versión ACOTADA de `extendToScrollEnd`: estira el borde inferior del
   * cutout hasta `extendBelow` puntos por debajo del ancla, con dos topes
   * duros — el fondo de la superficie de scroll y el techo del tooltip (que a
   * su vez ya está por encima de la barra de tabs).
   *
   * Existe porque `extendToScrollEnd` es TODO o NADA: en el paso `list` de
   * Gastos el recuadro se comía media pantalla y la navegación (QA del owner
   * 2026-08-17, "solo debe resaltar la sección de movimientos"). Con un tope
   * el recuadro cubre el encabezado de la sección más las filas que entran, y
   * deja el aire donde va el tooltip.
   *
   * Se ignora si `extendToScrollEnd` está en `true` (esa bandera manda).
   */
  extendBelow?: number
}

/**
 * Per-step tooltip customization. Falls back to global defaults
 * defined on `<TourProvider>`. Useful when one step lives over a
 * dark hero card (force light tooltip) or vice-versa.
 */
export interface TooltipStyle {
  backgroundColor?: string
  foregroundColor?: string
  mutedForeground?: string
  primaryColor?: string
  primaryForeground?: string
}

export interface StepConfig {
  text: string
  highlight?: HighlightStyle
  tooltip?: TooltipStyle
}

/**
 * Provider-level defaults. These are the knobs the user asked for:
 * scrim opacity, scroll speed, transition feel.
 */
export interface TourDefaults {
  /** Scrim opacity 0-1. Default: 0.78. */
  scrimOpacity?: number
  /** Scrim base color. Default: V1 surface-950. */
  scrimColor?: string
  /** Default highlight padding. Default: 6. */
  highlightPadding?: number
  /** Default highlight border radius (when no per-step override). Default: 18. */
  highlightRadius?: number
  /** Spring config for the cutout's position/size animation. */
  highlightSpring?: { damping: number; stiffness: number; mass: number }
  /** Spring config for the tooltip's slide. */
  tooltipSpring?: { damping: number; stiffness: number; mass: number }
  /** Auto-scroll animation duration in ms. Default: 320. */
  scrollDurationMs?: number
  /** Where to place the highlighted target after auto-scroll, as a
   * fraction of the visible viewport (0 = top, 1 = bottom).
   * Default: 0.30 (30% from top — leaves room for tooltip). */
  scrollOffsetRatio?: number
  /** Pulse loop duration in ms (one half-cycle). Default: 1100. */
  pulseDurationMs?: number
  /** Spanish-by-default labels for the tooltip controls. */
  labels?: {
    next?: string
    previous?: string
    finish?: string
    skip?: string
  }
}

export interface RegisteredStep {
  tour: TourKey
  order: number
  viewRef: RefObject<View | null>
  configRef: RefObject<StepConfig>
}

export interface TourEvents {
  onStepChange?: (tour: TourKey, index: number, total: number) => void
  onStop?: (tour: TourKey, completed: boolean) => void
}
