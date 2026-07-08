import { createContext, useContext } from 'react'
import type { RegisteredStep, TourDefaults } from './types'
import type { TourKey } from './tour-keys'

/**
 * Pure context module — the React Context object plus the
 * `useTour` consumer hook. Kept separate from the Provider
 * implementation so `<TourHost>` and `<TourTooltip>` can read
 * context without pulling in the Provider (which itself needs to
 * import the Host) — that import path was the require-cycle
 * source previously flagged in dev:
 *
 *   tour-context → tour-host → tour-context (cycle)
 *
 * With the Provider extracted into `tour-provider.tsx`, the graph
 * becomes:
 *
 *   tour-provider → tour-context     ← reads Context
 *   tour-provider → tour-host        ← renders below children
 *   tour-host     → tour-context     ← reads useTour
 *   tour-tooltip  → tour-context     ← reads useTour
 *
 * No cycles.
 */

export interface TourContextValue {
  // Target lifecycle
  registerStep: (step: RegisteredStep) => void
  unregisterStep: (tour: TourKey, order: number) => void

  // Tour control
  /** Arranca el tour. Devuelve `false` (no-op) si no hay pasos
   *  registrados — el caller no debe latchear su "ya disparé". */
  start: (tour: TourKey, fromIndex?: number) => boolean
  stop: (completed?: boolean) => void
  next: () => void
  prev: () => void

  // Current state
  activeTour: TourKey | null
  activeIndex: number
  totalSteps: number
  isFirstStep: boolean
  isLastStep: boolean
  /**
   * The currently active registered step, or null when no tour is
   * running. Both viewRef and configRef live on this object — the
   * config is read fresh from the ref at execution time so per-step
   * prop updates flow through without re-registering.
   */
  currentStep: RegisteredStep | null

  defaults: Required<TourDefaults>

  /** Bumps when steps re-register so host can re-measure. */
  measureToken: number
}

export const TourCtx = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourCtx)
  if (!ctx) {
    throw new Error('useTour must be called inside <TourProvider>')
  }
  return ctx
}
