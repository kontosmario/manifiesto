import { useEffect, useRef, type RefObject } from 'react'
import type { View } from 'react-native'
import { useTour } from './tour-context'
import type { HighlightStyle, StepConfig, TooltipStyle } from './types'
import type { TourKey } from './tour-keys'

interface UseTourTargetRefOptions {
  text: string
  highlight?: HighlightStyle
  tooltip?: TooltipStyle
}

/**
 * Lower-level alternative to `<TourTarget>` for cases where wrapping
 * children in an extra View isn't an option — e.g. the two halves
 * of a card that lives in a leaf component, or a button buried in
 * a sub-component we don't want to refactor.
 *
 * Returns a ref to attach to whatever native View should host the
 * highlight measurement. The hook handles registration/unregistration
 * with the tour context, exactly like `<TourTarget>`, and reads the
 * step config fresh on every render so prop updates flow through
 * without re-registering.
 *
 * Usage:
 *   const variableRef = useTourTargetRef(HOME_TOUR, 4, {
 *     text: '...',
 *   })
 *   // Then forward `variableRef` to the half you want highlighted:
 *   <MonthSummaryCard variableRef={variableRef} ... />
 */
export function useTourTargetRef(
  tour: TourKey,
  order: number,
  options: UseTourTargetRefOptions,
): RefObject<View | null> {
  const viewRef = useRef<View | null>(null)
  const configRef = useRef<StepConfig>(options)
  configRef.current = options

  const { registerStep, unregisterStep } = useTour()

  useEffect(() => {
    registerStep({ tour, order, viewRef, configRef })
    return () => {
      unregisterStep(tour, order)
    }
  }, [tour, order, registerStep, unregisterStep])

  return viewRef
}
