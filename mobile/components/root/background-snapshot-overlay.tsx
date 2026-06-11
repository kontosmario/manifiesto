// Sprint P · Audit #9 P-2 (2026-06-10): background snapshot overlay.
//
// iOS captures a screenshot of the topmost view when the app transitions
// to the inactive/background state, then surfaces that snapshot in the
// multitasking switcher. The snapshot also persists on disk for days
// (under `Library/Caches/Snapshots/<bundle id>/`). For a finance app,
// that means balance/spending screens, account numbers, or PIN-pad state
// can be recovered by forensic dump on a stolen-but-locked device.
//
// Mitigation: mount an opaque, full-screen overlay the moment AppState
// shifts to `inactive` — the transitional state iOS dispatches BEFORE
// `background`. The snapshot iOS captures is whatever is on screen
// during that transition, so by covering it we ensure the cached PNG
// shows only the overlay (brand-coloured) instead of user data. On
// return to `active` we hide the overlay.
//
// Android: AppState reports `inactive` less reliably than iOS (it goes
// active → background on most OEM stacks). We still mount the overlay
// on either `inactive` OR `background` so the switcher preview is
// covered. Android also exposes FLAG_SECURE as a stronger mitigation
// — that's the screen-capture story (Audit #9 P-3 / expo-screen-capture),
// not this overlay's job.
//
// Implementation notes:
//   * Uses a Reanimated shared value driven directly inside the
//     AppState listener (runOnUI-style assignment) to avoid the
//     React setState → render → commit cycle latency. The overlay
//     must be opaque by the time iOS reads the snapshot — that
//     happens ~one frame after `inactive` fires.
//   * Pre-mounted (display always rendered, opacity-driven). Mounting
//     on event would lose ~16-50ms to layout + native view creation.
//   * pointerEvents toggles so the overlay never intercepts taps when
//     hidden.
//   * z-index above the auth transition splash (50) so even mid-auth
//     transitions, backgrounding hides the sensitive content.
//
// ─────────────────────────────────────────────────────────────────────
// Sprint Q · Audit #10 Q-6 (2026-06-10) — Known residual risk
// (DOCUMENTED, accepted for v1.0):
//
//   Known limitation: the JS-thread AppState listener still races
//   iOS's snapshot capture. iOS fires `applicationWillResignActive`
//   on the native side and grabs the snapshot a small number of frames
//   later — we observe this as the `inactive` event in JS. On a
//   reasonably fast device the Reanimated shared-value path makes the
//   overlay opaque BEFORE the snapshot lands, but on cold-cache /
//   slow-device paths the window is non-zero and one frame of sensitive
//   UI could slip into the cached PNG under `Library/Caches/Snapshots/`.
//
//   Mitigation in place:
//     • Pre-mounted view (no native view creation on the hot path).
//     • Reanimated shared value (UI-thread commit, no React render).
//     • Opaque colour (single-frame paint sufficient).
//
//   Future improvement (NOT planned for v1.0):
//     • Native module bridging `applicationWillResignActive` to set
//       the overlay's hidden state synchronously inside the iOS
//       delegate, eliminating the JS round-trip. Requires writing a
//       small Expo Module + maintaining it through EAS Build upgrades.
//
//   Why we're accepting the risk:
//     • Blast radius is forensic-only — requires physical device
//       acquisition + filesystem extraction tools (snapshot lives
//       under sandboxed `Library/Caches/`).
//     • The window is sub-frame on most devices; the overlay wins.
//     • Adding a native module adds maintenance burden + EAS Build
//       complexity that doesn't earn its keep at our threat model.
//     • Re-evaluate triggers: high-profile-user reports, or any
//       finance-focused threat-model upgrade in a future audit.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native'
import { authFlowLog } from '@/lib/auth-flow-logger'
import { isBiometricPromptInFlight } from '@/lib/biometric-prompt-state'
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

// Forest-deep — matches the dark-mode canvas (see palette.ts surface-950
// + dark-mode canvas mapping). Solid colour is enough; the overlay is
// only meant to obscure sensitive UI, not communicate brand. If we ever
// want a logo here, render <FernLogo /> centred inside — keep it static
// (no animation) so the captured snapshot stays consistent.
const OVERLAY_COLOR = '#12211A'

export function BackgroundSnapshotOverlay() {
  // 0 = hidden (interactive), 1 = visible (opaque cover). Driven on
  // the UI thread by the AppState handler — we assign directly so the
  // first commit lands on the next frame, racing the iOS snapshot.
  const opacity = useSharedValue(0)
  // Mirror of the same state on the JS thread, used only to flip
  // `pointerEvents` on the wrapping View (a non-animatable prop).
  // Lags ~1 frame behind `opacity` but that's fine for touch routing.
  const [covered, setCovered] = useState(false)

  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      // `inactive` is iOS's "about to background" transition. We cover
      // immediately to win the race with the snapshot capture.
      // `background` covers Android's typical lifecycle.
      // `active` returns the app to the foreground — remove the cover.
      // PROMPT BIOMÉTRICO EN VUELO (2026-06-11): presentar Face ID (o la
      // sheet de passcode en Expo Go) pone la app en `inactive` durante
      // TODO el prompt y ~1.4s después de resolver (medido en device).
      // Cubrir ahí tapaba el viaje de unlock entero — incluido el
      // soar-away — con verde sólido. No hay snapshot de multitasking
      // que proteger durante un prompt (la app no se está backgroundeando
      // y debajo solo hay superficie de marca), así que el `inactive`
      // del prompt se ignora. Un `background` REAL (swipe a multitasking
      // mid-prompt) sigue cubriendo — esa rama no se filtra.
      const promptInFlight = isBiometricPromptInFlight()
      const skipForPrompt = next === 'inactive' && promptInFlight
      authFlowLog('snapshot-overlay', `AppState → ${next}`, {
        coverWillBe: skipForPrompt
          ? 'SKIP (prompt biométrico en vuelo)'
          : next === 'inactive' || next === 'background'
            ? 'ON'
            : next === 'active'
              ? 'OFF'
              : 'sin cambio',
      })
      if (skipForPrompt) return
      if (next === 'inactive' || next === 'background') {
        opacity.value = 1
        setCovered(true)
      } else if (next === 'active') {
        opacity.value = 0
        setCovered(false)
      }
    }
    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
  }, [opacity])

  // WATCHDOG (2026-06-11): el prompt de LocalAuthentication (sheet de
  // passcode en Expo Go, Face ID en builds) hace pasar la app por
  // `inactive` → cover ON. Si el evento `active` del cierre del prompt
  // se pierde o llega fuera de orden, el cover (verde sólido, z100,
  // sobre TODO) queda pegado para siempre — el bug "pantalla solo
  // verde post-success". Mientras el cover esté ON, verificamos cada
  // 250ms el estado real: si iOS dice `active`, descubrimos y lo
  // logueamos fuerte (sirve de diagnóstico además de cura).
  useEffect(() => {
    if (!covered) return
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        authFlowLog(
          'snapshot-overlay',
          '⚠ WATCHDOG: cover pegado con AppState=active (evento active perdido/desordenado) → descubriendo',
        )
        opacity.value = 0
        setCovered(false)
      }
    }, 250)
    return () => clearInterval(interval)
  }, [covered, opacity])

  // Keep the JS-thread `covered` flag in sync if the shared value is
  // ever driven from elsewhere (defence in depth — currently nothing
  // else writes to it). useAnimatedReaction is the canonical bridge.
  useAnimatedReaction(
    () => opacity.value,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setCovered)(current > 0)
      }
    },
  )

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      pointerEvents={covered ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFillObject, styles.overlay, animatedStyle]}
    >
      <View style={[StyleSheet.absoluteFillObject, styles.cover]} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    // z-index above the auth transition splash (50) so even mid-auth
    // transitions, backgrounding still hides sensitive UI.
    zIndex: 100,
  },
  cover: {
    backgroundColor: OVERLAY_COLOR,
  },
})
