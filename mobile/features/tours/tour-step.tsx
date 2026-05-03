import type { ReactElement } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { CopilotStep } from 'react-native-copilot'
import type { TourKey } from './tour-keys'

interface TourStepProps {
  tour: TourKey
  /** 0-based order within the tour. */
  order: number
  /** Tooltip body text. */
  text: string
  /** Single child whose layout becomes the highlight target. */
  children: ReactElement
}

/**
 * Wraps a target view with `<CopilotStep>` only while the parent
 * screen is focused. Two reasons:
 *
 *  1. `<CopilotProvider>` is global, so steps from every mounted
 *     screen would otherwise share the same tour. Filtering by focus
 *     means the active screen's steps are the only ones registered
 *     when `start()` runs.
 *  2. The `freezeOnBlur: false` setting on the tab navigator keeps
 *     all four tabs in memory at once, so we can't rely on
 *     unmount/remount.
 *
 * Step `name` is computed as `<tour>/<order>` so it's globally
 * unique even if two screens use the same numeric order.
 */
export function TourStep({ tour, order, text, children }: TourStepProps) {
  const isFocused = useIsFocused()
  return (
    <CopilotStep
      active={isFocused}
      name={`${tour}/${order}`}
      order={order}
      text={text}
    >
      {children}
    </CopilotStep>
  )
}
