import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { CopilotStep, walkthroughable } from 'react-native-copilot'
import type { TourKey } from './tour-keys'

/**
 * `<CopilotStep>` doesn't pass `ref` to its child directly — it
 * clones the child with `{ copilot: { ref, onLayout } }` and
 * expects the child to spread those onto a native primitive. The
 * library ships a `walkthroughable` HOC for exactly this; without
 * it, the child silently ignores the `copilot` prop, the wrapper
 * ref is never populated, and the library's measure loop spins on
 * `requestAnimationFrame` forever — `start()` then awaits a promise
 * that never resolves and *nothing renders*.
 *
 * That's why earlier iterations of this component (wrapping plain
 * `<View>` or `<Animated.View>` as the CopilotStep child) made the
 * tour never appear in the UI.
 */
const WalkthroughableView = walkthroughable(View)

interface TourStepProps {
  tour: TourKey
  /** 0-based order within the tour. */
  order: number
  /** Tooltip body text. */
  text: string
  /** Content whose layout becomes the highlight target. */
  children: ReactNode
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
      {/* `collapsable={false}` keeps the View in the native layout
          tree on Android even when it has no styling — required for
          the library's `measure()` to return a valid rect. */}
      <WalkthroughableView collapsable={false}>{children}</WalkthroughableView>
    </CopilotStep>
  )
}
