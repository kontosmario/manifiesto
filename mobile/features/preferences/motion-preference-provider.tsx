// Motion preference — user-facing override for the heuristic that
// disables decorative loop animations on slower hardware.
//
//   - `auto`    (default): respect OS accessibility "Reduce Motion"
//     + auto-detect old hardware via `Device.deviceYearClass < 2020`.
//   - `always`: force reduced motion on every device (accessibility-
//     conscious users, battery savers, motion-sickness users).
//   - `never`:  force full motion even on hardware classified as old
//     (escape hatch for users who prefer the visual richness over
//     fluidity, e.g. someone who keeps an aging device but rarely
//     runs heavy scenes).
//
// The actual reduced-motion decision lives in `useReducedMotion()` —
// this provider only owns the user's preference and its persistence.
// We persist via `persistent-kv` (SecureStore on native, localStorage
// on web) so the choice survives reinstalls of the OS-level setting.
//
// The provider seeds with the persisted value asynchronously; until
// the read settles we keep `'auto'` as a sensible default so first-
// paint behavior is predictable.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

export type MotionPreference = 'auto' | 'always' | 'never'

const MOTION_PREFERENCE_KEY = 'manifiesto:motion-preference'

interface MotionPreferenceContextValue {
  preference: MotionPreference
  setPreference: (value: MotionPreference) => void
}

const MotionPreferenceContext = createContext<MotionPreferenceContextValue>({
  preference: 'auto',
  setPreference: () => {},
})

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'auto' || value === 'always' || value === 'never'
}

interface MotionPreferenceProviderProps {
  children: ReactNode
}

export function MotionPreferenceProvider({ children }: MotionPreferenceProviderProps) {
  const [preference, setPreferenceState] = useState<MotionPreference>('auto')

  useEffect(() => {
    let cancelled = false
    void getPersistentValue(MOTION_PREFERENCE_KEY).then((stored) => {
      if (cancelled) return
      if (isMotionPreference(stored)) {
        setPreferenceState(stored)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setPreference = useCallback((value: MotionPreference) => {
    setPreferenceState(value)
    void setPersistentValue(MOTION_PREFERENCE_KEY, value)
  }, [])

  const contextValue = useMemo<MotionPreferenceContextValue>(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  )

  return (
    <MotionPreferenceContext.Provider value={contextValue}>
      {children}
    </MotionPreferenceContext.Provider>
  )
}

/** Read the current preference. Most consumers want
 *  `useReducedMotion()` instead — this hook is for the settings UI. */
export function useMotionPreference(): MotionPreference {
  return useContext(MotionPreferenceContext).preference
}

/** Setter for the settings UI. */
export function useMotionPreferenceControls() {
  return useContext(MotionPreferenceContext)
}
