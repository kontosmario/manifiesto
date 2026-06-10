// Sprint P · Audit #9 P-3 (2026-06-10): screen-capture protection.
//
// Screens that render the PIN-pad, the password reset form, or the
// login/signup credential entry are sensitive enough that allowing
// screen recording / screenshots is a remote-control / replay risk
// (attacker gets video of the unlock keystrokes, or screenshots of
// a half-typed password). expo-screen-capture exposes the platform
// APIs that disable both:
//   * iOS: UIScreen.isCaptured + screenCaptureDidChange notification
//     (actually it's the prevent API which the module wires up).
//   * Android: WindowManager.LayoutParams.FLAG_SECURE — blocks both
//     screenshot and screen recording for the whole window.
//
// This hook is the canonical wrapper: every sensitive screen calls it
// in a top-level useEffect with no deps. On mount it requests capture
// prevention; on unmount it releases. expo-screen-capture handles
// reference counting so two screens stacking (e.g. rapid navigation
// between login and signup) don't accidentally re-allow capture when
// the first unmounts.
//
// Failure mode: preventScreenCaptureAsync rejects if the platform
// doesn't expose the API (web). We swallow the error — best-effort
// security; we still want the screen to render even if the OS refuses.

import { useEffect } from 'react'
import * as ScreenCapture from 'expo-screen-capture'

/**
 * Disables screen recording + screenshot while the calling component
 * is mounted (and, optionally, only while `enabled` is true — useful
 * for sheets/modals that conditionally render sensitive UI). The hook
 * is safe to compose with rapid navigation: expo-screen-capture
 * reference-counts the prevent/allow pair, so two stacking screens
 * don't accidentally fall through into permissive mode between unmount
 * and mount.
 *
 * Use on: PIN unlock, PIN setup, login, signup, password reset, and
 * the destructive-action re-auth sheet. Do NOT use on regular product
 * screens — disabling capture there breaks legitimate user workflows
 * (sharing a savings goal, screen-sharing in support sessions, etc.).
 */
export function useScreenCaptureProtection(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    void ScreenCapture.preventScreenCaptureAsync().catch(() => {
      // Best-effort: web has no native equivalent. Don't throw.
    })
    return () => {
      void ScreenCapture.allowScreenCaptureAsync().catch(() => {})
    }
  }, [enabled])
}
