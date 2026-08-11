import type { ReactNode } from 'react'

export type LeftoverOption = 'meta' | 'acumular' | 'reserva'

export interface SceneRenderArgs {
  reduced: boolean
}

/** Partículas del handoff que la escena pide como fondo vivo. */
export interface SceneParticles {
  colors: readonly string[]
  count: number
}

export interface Scene {
  id: string
  background: string
  foreground: string
  foregroundSoft: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  /** Fill radial del CTA del sistema; `ctaBg` queda como fallback sólido. */
  ctaGradientCss: string
  ctaShadow: string
  ctaFg: string
  confetti?: boolean
  confettiSceneIdx?: number
  particles?: SceneParticles
  render: (args: SceneRenderArgs) => ReactNode
}
