// Context + hook to register vertical offsets of each Control section
// so the dispatcher can smooth-scroll the ScrollView to them.
//
// Usage:
//  1. Wrap the Control screen in `<ControlSectionAnchorProvider>`.
//  2. Each section wraps itself in `<ControlSectionAnchor section="semana">`
//     which measures its offset on layout and registers it.
//  3. The dispatcher reads `anchors.get('semana')` and calls
//     `scrollViewRef.current?.scrollTo({ y, animated: true })`.

import { createContext, useContext } from 'react'
import type { ScrollView } from 'react-native'
import type { ControlSectionAnchor } from '@/features/insights/control-action'

export interface ControlAnchorsController {
  scrollRef: React.RefObject<ScrollView | null>
  registerOffset: (section: ControlSectionAnchor, y: number) => void
  scrollToSection: (section: ControlSectionAnchor) => void
  /** Section that should pulse right now (driven by dispatcher). */
  pulsingSection: ControlSectionAnchor | null
}

const noop = () => {}

const defaultController: ControlAnchorsController = {
  scrollRef: { current: null },
  registerOffset: noop,
  scrollToSection: noop,
  pulsingSection: null,
}

export const ControlAnchorsContext =
  createContext<ControlAnchorsController>(defaultController)

export function useControlAnchors(): ControlAnchorsController {
  return useContext(ControlAnchorsContext)
}
