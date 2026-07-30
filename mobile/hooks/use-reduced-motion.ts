import { useReducedMotionValue } from '@/features/preferences/reduced-motion-provider'

/**
 * Should we suppress decorative / press animations on this device?
 *
 * This is now a PURE context read — the actual resolution (user Motion
 * preference override + OS "Reduce Motion" toggle + hardware
 * device-year-class heuristic) plus the single `AccessibilityInfo`
 * subscription live in `ReducedMotionProvider`, mounted once near the
 * app root. Every call site (there are ~80, and `usePressScale` fans
 * them out across dozens of pressables per screen) therefore costs a
 * single `useContext` read: no per-call listeners, no per-call async
 * bridge round-trips.
 *
 * The returned boolean is IDENTICAL to what this hook returned before
 * the provider existed, including reactivity: when the user flips the
 * OS "Reduce Motion" toggle at runtime the provider's live listener
 * updates the context, so every consumer re-renders and every
 * `useLoopAnimation` / `useUnboundedLoopAnimation` / `usePressScale`
 * gate flips — cancelling decorative loops and parking shared values
 * at rest, exactly as before.
 *
 * (Consumed only on the JS thread and passed into worklets as a plain
 * value — Reanimated worklets never read React context directly.)
 */
export function useReducedMotion(): boolean {
  return useReducedMotionValue()
}
