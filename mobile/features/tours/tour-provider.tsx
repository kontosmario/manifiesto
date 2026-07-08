import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { useTranslation } from 'react-i18next'
import { TourCtx, type TourContextValue } from './tour-context'
import { TourHost } from './tour-host'
import type { RegisteredStep, TourDefaults, TourEvents } from './types'
import type { TourKey } from './tour-keys'

const FALLBACK_DEFAULTS: Omit<Required<TourDefaults>, 'labels'> = {
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
  const { t } = useTranslation()
  const defaults = useMemo<Required<TourDefaults>>(() => {
    const defaultLabels = {
      next: t('states:tour.labels.next'),
      previous: t('states:tour.labels.previous'),
      finish: t('states:tour.labels.finish'),
      skip: t('states:tour.labels.skip'),
    }
    if (!overrideDefaults) return { ...FALLBACK_DEFAULTS, labels: defaultLabels }
    return {
      ...FALLBACK_DEFAULTS,
      ...overrideDefaults,
      labels: { ...defaultLabels, ...overrideDefaults.labels },
    }
  }, [overrideDefaults, t])

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

  // Devuelve si el tour ARRANCÓ: con 0 pasos registrados (p.ej. la
  // pantalla está en un empty state sin TourTargets) es un no-op y el
  // caller no debe latchear su "ya disparé" (use-screen-tour).
  const start = useCallback((tour: TourKey, fromIndex = 0): boolean => {
    const list = stepsRef.current.get(tour) ?? []
    if (list.length === 0) return false
    setActiveTour(tour)
    setActiveIndex(Math.max(0, Math.min(fromIndex, list.length - 1)))
    return true
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

  // Re-sync defensivo (auditoría tours 2026-07-08): si los targets se
  // desmontan a MITAD de tour (p.ej. la pantalla flippea a un empty
  // state por un refetch), la lista se achica pero activeIndex no —
  // currentStep quedaba null con el scrim arriba y SIN tooltip (el
  // botón "Saltar" vive en el tooltip → usuario atrapado en iOS). Con
  // lista vacía cerramos el tour; con índice fuera de rango clampeamos
  // al último paso vivo. `measureToken` cambia en cada register/
  // unregister, así el efecto re-evalúa cuando la lista muta.
  useEffect(() => {
    if (!activeTour) return
    const steps = stepsRef.current.get(activeTour) ?? []
    if (steps.length === 0) {
      stop(false)
      return
    }
    if (activeIndex > steps.length - 1) {
      setActiveIndex(steps.length - 1)
    }
  }, [activeTour, activeIndex, measureToken, stop])

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
