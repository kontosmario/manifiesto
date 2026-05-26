import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { TourCtx, type TourContextValue } from './tour-context'
import { TourHost } from './tour-host'
import type { RegisteredStep, TourDefaults, TourEvents } from './types'
import type { TourKey } from './tour-keys'

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
  // Tuned for premium step transitions: ζ ≈ 0.88 (slightly under
  // critical → settles in ~280ms with a near-imperceptible tail).
  highlightSpring: { damping: 26, stiffness: 260, mass: 0.85 },
  // Tooltip slides slightly more damped (ζ ≈ 0.98 ≈ critical) so it
  // glides into place without a wobble.
  tooltipSpring: { damping: 28, stiffness: 240, mass: 0.85 },
  // Scroll happens in parallel with the cutout spring; this is no
  // longer a wall-clock wait, just a knob for tooltip-arrival math.
  scrollDurationMs: 280,
  scrollOffsetRatio: 0.3,
  pulseDurationMs: 1100,
  labels: DEFAULT_LABELS,
}

interface TourProviderProps extends TourEvents {
  defaults?: TourDefaults
}

/**
 * Hosts the registry of `<TourTarget>` instances and the imperative
 * controls. Renders `<TourHost>` as a sibling of children so the
 * overlay sits above every screen regardless of where in the tree
 * consumers live.
 *
 * Step storage is split:
 *   - `stepsRef` — Map<tour, RegisteredStep[]> in a ref so
 *     register/unregister doesn't trigger re-renders of every
 *     descendant. The host reacts via `measureToken`.
 *   - `activeTour` / `activeIndex` — actual state that drives the
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

  const stepsRef = useRef(new Map<TourKey, RegisteredStep[]>())
  const [measureToken, setMeasureToken] = useState(0)

  const [activeTour, setActiveTour] = useState<TourKey | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const registerStep = useCallback((step: RegisteredStep) => {
    const list = stepsRef.current.get(step.tour) ?? []
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

  const start = useCallback((tour: TourKey, fromIndex = 0) => {
    const list = stepsRef.current.get(tour) ?? []
    if (list.length === 0) return
    setActiveTour(tour)
    setActiveIndex(Math.max(0, Math.min(fromIndex, list.length - 1)))
  }, [])

  const next = useCallback(() => {
    setActiveIndex((i) => {
      if (!activeTour) return i
      const list = stepsRef.current.get(activeTour) ?? []
      if (i >= list.length - 1) {
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

  useEffect(() => {
    if (!activeTour || !onStepChange) return
    const list = stepsRef.current.get(activeTour) ?? []
    onStepChange(activeTour, activeIndex, list.length)
  }, [activeTour, activeIndex, onStepChange])

  const list = activeTour ? stepsRef.current.get(activeTour) ?? [] : []
  const currentStep: RegisteredStep | null = list[activeIndex] ?? null
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
      currentStep,
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
      currentStep,
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
