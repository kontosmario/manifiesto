import { type ReactNode } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  FadeIn,
  ReduceMotion,
} from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'

interface ModalContentEntranceProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Layered entrance for modal content.
 *
 * Why
 * ---
 * Native-stack modals (`presentation: 'modal'`) handle the SHEET
 * animation: slide-up from bottom + scrim. That part lives in the
 * platform layer and is correct as-is — touching it would fight
 * the native swipe-down dismiss + system gestures + accessibility.
 *
 * What this component adds: a SUBTLE second layer that fades the
 * INNER content in after the sheet has settled, giving the user a
 * "spatial context" cue (the content "lands" rather than appearing
 * with the sheet). It runs alongside the platform slide and never
 * conflicts with it.
 *
 * Usage
 * -----
 * Wrap the root JSX of any screen registered as `presentation:
 * 'modal'` in `app-stack-shell.tsx` (add-expense, add-fixed-expense,
 * household-setup, expense-filters, expense-categories, asistente,
 * coach, onboarding) — apply at the screen's outermost View.
 *
 * Reduced motion is respected automatically via Reanimated's
 * built-in `ReduceMotion.System` fallback: when the OS setting is
 * on, the entering animation is skipped and the content snaps in.
 */
export function ModalContentEntrance({ children, style }: ModalContentEntranceProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(motionDurations.enterModal).reduceMotion(
        ReduceMotion.System,
      )}
      style={style}
    >
      {children}
    </Animated.View>
  )
}
