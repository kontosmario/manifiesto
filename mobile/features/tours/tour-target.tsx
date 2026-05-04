import { useEffect, useRef, type ReactNode } from 'react'
import { View } from 'react-native'
import { useTour } from './tour-context'
import type { HighlightStyle, StepConfig, TooltipStyle } from './types'
import type { TourKey } from './tour-keys'

interface TourTargetProps {
  tour: TourKey
  /** 0-based order within the tour. Determines step sequence. */
  order: number
  /** Tooltip body text. */
  text: string
  /** Per-step highlight customization. Merged with provider defaults. */
  highlight?: HighlightStyle
  /** Per-step tooltip overrides. Merged with provider defaults. */
  tooltip?: TooltipStyle
  /** Content whose layout becomes the highlight target. */
  children: ReactNode
}

/**
 * Wraps a piece of UI as a stop in a guided tour. Replaces the
 * `<TourStep>` (and `react-native-copilot`'s `<CopilotStep>`)
 * version: refs are attached directly to a wrapper View, the
 * provider's `registerStep` is called via useEffect, and
 * unregistration happens cleanly on unmount.
 *
 * The `children` are rendered inside a `<View collapsable={false}>`
 * to guarantee the layout node survives Android's view-collapsing
 * optimization — required for `measureInWindow` to return a real
 * rect.
 *
 * Step config (text + highlight + tooltip) is captured in a ref
 * each render, so updates to the props don't force re-registration
 * of the step. The host reads `configRef.current` at measure time.
 */
export function TourTarget({
  tour,
  order,
  text,
  highlight,
  tooltip,
  children,
}: TourTargetProps) {
  const viewRef = useRef<View | null>(null)
  const configRef = useRef<StepConfig>({ text, highlight, tooltip })
  configRef.current = { text, highlight, tooltip }

  const { registerStep, unregisterStep } = useTour()

  useEffect(() => {
    registerStep({ tour, order, viewRef, configRef })
    return () => {
      unregisterStep(tour, order)
    }
  }, [tour, order, registerStep, unregisterStep])

  return (
    <View ref={viewRef} collapsable={false}>
      {children}
    </View>
  )
}
