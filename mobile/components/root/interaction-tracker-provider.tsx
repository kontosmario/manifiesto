// Global touch listener for the inactivity tracker.
//
// Mounts a fullscreen <View> at the root with `pointerEvents="box-none"`
// so it observes onTouchStart events without consuming them. Every
// touch resets the inactivity timer via `recordInteraction()`.
//
// Why `box-none`: it allows touches to pass through to children
// normally, while React Native still dispatches the touch through this
// View's responder chain so we receive the `onTouchStart` event. If we
// used the default `'auto'`, this View would become the touch target
// and discard the events.
//
// Sprint R-2 (2026-06-10).

import type { PropsWithChildren } from 'react'
import { View } from 'react-native'
import { recordInteraction } from '@/features/auth/inactivity-tracker'

export function InteractionTrackerProvider({ children }: PropsWithChildren) {
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={recordInteraction}
      // CRITICAL: box-none so children receive the touch events normally.
      // Without it, this View would capture and discard all touches.
      pointerEvents="box-none"
    >
      {children}
    </View>
  )
}
