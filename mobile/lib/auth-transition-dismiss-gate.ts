// Pure predicate used by every screen that owns a splash-dismiss
// `useEffect`.
//
// Background: the auth transition splash is shown by `signup-screen`
// and the login controller before navigating to a screen that may
// finish loading on its own. Each landing screen is responsible for
// calling `markAuthTransitionLoaded()` once its data is ready —
// otherwise the 15s `safetyTimer` in `auth-transition-splash.ts`
// promotes the splash to `error('timeout')` and the user reads
// "La conexión está demorando" even though everything loaded fine.
//
// Centralizing the predicate keeps the `useEffect` body identical
// across `AppEntryGate`, `RequireAuth`, `RequireGuest`,
// `OnboardingRoute`, and `AppStackShell` — so future screens can't
// accidentally drift to a slightly different condition.

export interface AuthTransitionDismissInput {
  /** True while the screen's queries are still in flight. */
  isLoading: boolean
  /** True while the global splash overlay is currently visible. */
  splashVisible: boolean
}

export function shouldDismissAuthTransition(
  input: AuthTransitionDismissInput,
): boolean {
  return !input.isLoading && input.splashVisible
}
