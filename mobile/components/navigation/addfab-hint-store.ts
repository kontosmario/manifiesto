// One-time discoverability hint for the central "+" FAB long-press (the
// speed-dial: ingreso, fijo, importar, día sin gasto). Users don't discover the
// gesture on their own.
//
// Trigger = BEHAVIOR, not the tour/profile state: we surface a one-time tip only
// after the user has tapped the "+" a few times WITHOUT ever long-pressing. This
// is reliable (a local counter, no dependency on profile/tour hydration) and
// never fires during onboarding (it requires repeated real use first), so it
// doesn't duplicate the Home tour's FAB step.
//
// Persistence: SecureStore on native, localStorage on web.

import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const STORAGE_KEY = 'addfab-hint:v2'
const TIP_AFTER_TAPS = 3

interface HintState {
  seen: boolean
  taps: number
}

let state: HintState = { seen: false, taps: 0 }
let hydratePromise: Promise<void> | null = null

// Shared promise so concurrent callers all await the SAME read (avoids a
// caller acting on un-hydrated state).
function hydrate(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await getPersistentValue(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<HintState>
          state = { seen: parsed.seen === true, taps: Number(parsed.taps) || 0 }
        }
      } catch {
        // Corrupt / unavailable — start clean (harmless).
      }
    })()
  }
  return hydratePromise
}

function persist(): void {
  void setPersistentValue(STORAGE_KEY, JSON.stringify(state))
}

/** The user used the long-press (or already saw the tip) → never show it again. */
export async function markAddFabHintSeen(): Promise<void> {
  await hydrate()
  if (state.seen) return
  state = { ...state, seen: true }
  persist()
}

/** Record a "+" tap (quick add-expense). Counts toward the tip threshold. */
export async function noteAddFabTap(): Promise<void> {
  await hydrate()
  if (state.seen) return
  state = { ...state, taps: state.taps + 1 }
  persist()
}

/**
 * Whether to show the long-press tip now: true once the user has tapped "+" at
 * least TIP_AFTER_TAPS times without discovering the gesture. Does NOT mark it
 * seen — the caller marks it after actually showing the tip.
 */
export async function shouldShowAddFabTip(): Promise<boolean> {
  await hydrate()
  return !state.seen && state.taps >= TIP_AFTER_TAPS
}
