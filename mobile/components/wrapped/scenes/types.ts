import type { ReactNode } from 'react'

export type LeftoverOption = 'meta' | 'acumular' | 'reserva'

export interface SceneRenderArgs {
  reduced: boolean
}

export interface Scene {
  id: string
  background: string
  foreground: string
  foregroundSoft: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  ctaFg: string
  confetti?: boolean
  confettiSceneIdx?: number
  render: (args: SceneRenderArgs) => ReactNode
}
