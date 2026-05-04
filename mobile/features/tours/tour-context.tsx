import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { TourHost } from './tour-host'
import type {
  RegisteredStep,
  StepConfig,
  TourDefaults,
  TourEvents,
} from './types'
import type { TourKey } from './tour-keys'

interface TourContextValue {
  // Target lifecycle
  registerStep: (step: RegisteredStep) => void
  unregisterStep: (tour: TourKey, order: number) => void

  // Tour control
  start: (tour: TourKey, fromIndex?: number) => void
  stop: (completed?: boolean) => void
  next: () => void
  prev: () => void

  // Current state (drives re-renders of consumers like the tooltip)
  activeTour: TourKey | null
  activeIndex: number
  totalSteps: number
  isFirstStep: boolean
  isLastStep: boolean
  /** The current step's config, or null when no tour is active. */
  currentConfig: StepConfig | null
  /** The current step's view ref, used by the host to measure. */
  currentRef: React.RefObject<unknown> | null

  // Defaults (read by host + tooltip)
  defaults: Required<TourDefaults>

  // Internal: bumps when steps re-register so host can re-measure
  measureToken: number
}

const TourCtx = createContext<TourContextValue | null>(null)

const DEFAULT_LABELS = {
  next: 'Siguiente',
  previous: 'Anterior',
  finish: 'Finalizar',
  skip: 'Saltar',
} as const

const FALLBACK_DEFAULTS: Required<TourDefaults> = {
  scrimOpacity: 0.78,
  scrimColor: '#06120C',
  highlightPadding: 6,
  highlightRadius: 18,
  // Lifted from `motionSprings.value` (24/180/1.0) — calm, no overshoot.
  highlightSpring: { damping: 24, stiffness: 180, mass: 1.0 },
  // Lifted from `motionSprings.enter` (22/210/1.0).
  tooltipSpring: { damping: 22, stiffness: 210, mass: 1.0 },
  scrollDurationMs: 320,
  scrollOffsetRatio: 0.3,
  pulseDurationMs: 1100,
  labels: DEFAULT_LABELS,
}

interface TourProviderProps extends TourEvents {
  defaults?: TourDefaults
}

/**
 * Hosts the registry of `<TourTarget>` instances and the imperative
 * controls (`start`, `stop`, `next`, `prev`). Renders `<TourHost>`
 * as a sibling of children so the overlay sits above every screen
 * regardless of where in the tree consumers live.
 *
 * Step storage is split:
 *   - `stepsRef` — Map<tour, RegisteredStep[]> kept in a ref so
 *     register/unregister doesn't trigger re-renders of every
 *     descendant. The host still reacts to changes via
 *     `measureToken`.
 *   - `activeTour`/`activeIndex` — actual state that drives the
 *     overlay visibility and tooltip text.
 */
export function TourProvider({
  children,
  defaults: overrideDefaults,
  onStepChange,
  onStop,
}: PropsWithChildren<TourProviderProps>) {
  const defaults = useMemo<Required<TourDefaults>>(() => {
    if (!overrideDefaults) return FALLBACK_DEFAULTS
    return {
      ...FALLBACK_DEFAULTS,
      ...overrideDefaults,
      labels: { ...DEFAULT_LABELS, ...overrideDefaults.labels },
    }
  }, [overrideDefaults])

  // Steps registry. Kept in a ref so registrations don't churn
  // every descendant. `measureToken` bumps on changes so the host
  // re-runs its measurement effect.
  const stepsRef = useRef(new Map<TourKey, RegisteredStep[]>())
  const [measureToken, setMeasureToken] = useState(0)

  const [activeTour, setActiveTour] = useState<TourKey | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Stable callbacks — these are the contract every TourTarget +
  // useScreenTour caller depends on. Don't include state in their
  // deps or downstream effects re-run on every step transition.
  const registerStep = useCallback((step: RegisteredStep) => {
    const list = stepsRef.current.get(step.tour) ?? []
    // Replace any existing entry at the same order (re-mount case).
    const filtered = list.filter((s) => s.order !== step.order)
    filtered.push(step)
    filtered.sort((a, b) => a.order - b.order)
    stepsRef.current.set(step.tour, filtered)
    setMeasureToken((t) => t + 1)
  }, [])

  const unregisterStep = useCallback((tour: TourKey, order: number) => {
    const list = stepsRef.current.get(tour)
    if (!list) return
    const filtered = list.filter((s) => s.order !== order)
    if (filtered.length === 0) {
      stepsRef.current.delete(tour)
    } else {
      stepsRef.current.set(tour, filtered)
    }
    setMeasureToken((t) => t + 1)
  }, [])

  const stop = useCallback(
    (completed = false) => {
      setActiveTour((tour) => {
        if (tour && onStop) onStop(tour, completed)
        return null
      })
      setActiveIndex(0)
    },
    [onStop],
  )

  const start = useCallback(
    (tour: TourKey, fromIndex = 0) => {
      const list = stepsRef.current.get(tour) ?? []
      if (list.length === 0) return
      setActiveTour(tour)
      setActiveIndex(Math.max(0, Math.min(fromIndex, list.length - 1)))
    },
    [],
  )

  const next = useCallback(() => {
    setActiveIndex((i) => {
      if (!activeTour) return i
      const list = stepsRef.current.get(activeTour) ?? []
      if (i >= list.length - 1) {
        // Past last step — finish.
        if (onStop) onStop(activeTour, true)
        setActiveTour(null)
        return 0
      }
      return i + 1
    })
  }, [activeTour, onStop])

  const prev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1))
  }, [])

  // Emit step-change events.
  useEffect(() => {
    if (!activeTour || !onStepChange) return
    const list = stepsRef.current.get(activeTour) ?? []
    onStepChange(activeTour, activeIndex, list.length)
  }, [activeTour, activeIndex, onStepChange])

  // Derive current step's config + ref each render.
  const list = activeTour ? stepsRef.current.get(activeTour) ?? [] : []
  const currentStep: RegisteredStep | undefined = list[activeIndex]
  const currentConfig = currentStep?.configRef.current ?? null
  const currentRef = currentStep?.viewRef ?? null
  const totalSteps = list.length
  const isFirstStep = activeIndex === 0
  const isLastStep = totalSteps > 0 && activeIndex >= totalSteps - 1

  const value = useMemo<TourContextValue>(
    () => ({
      registerStep,
      unregisterStep,
      start,
      stop,
      next,
      prev,
      activeTour,
      activeIndex,
      totalSteps,
      isFirstStep,
      isLastStep,
      currentConfig,
      currentRef,
      defaults,
      measureToken,
    }),
    [
      registerStep,
      unregisterStep,
      start,
      stop,
      next,
      prev,
      activeTour,
      activeIndex,
      totalSteps,
      isFirstStep,
      isLastStep,
      currentConfig,
      currentRef,
      defaults,
      measureToken,
    ],
  )

  return (
    <TourCtx.Provider value={value}>
      {children}
      <TourHost />
    </TourCtx.Provider>
  )
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourCtx)
  if (!ctx) {
    throw new Error('useTour must be called inside <TourProvider>')
  }
  return ctx
}
