import { Easing } from 'react-native-reanimated'

export const motionDurations = {
  micro: 120,
  quick: 180,
  standard: 240,
  deliberate: 320,
  slow: 480,
  // ─── Navigation transition tokens (preview-validated 2026-04-30) ──
  // These map 1:1 to the curves prototyped in
  // `docs/transitions-preview.html`. Stack push/pop, tab switches and
  // modal open/close all read from here so the motion language stays
  // consistent across the app.
  enterStack: 280,
  exitStack:  200,    // ~70% of enter — the "exit-faster-than-enter" rule
  enterModal: 320,
  exitModal:  220,
  enterTab:   240,
  exitTab:    140,    // tab content sale antes de que entre el siguiente
  scrimIn:    280,
  scrimOut:   200,
  // Shake step — used in error-feedback shake sequences (pin pad,
  // form validation). 4 × 50ms ≈ 200ms total feedback con magnitud
  // decreciente da el "no" tactile sin sentirse pesado. Si se necesita
  // un valor distinto, agregar otro token en lugar de hard-codear.
  shakeStep:  50,
} as const

export type MotionDurationKey = keyof typeof motionDurations

// Decorative loop durations — fuera del rango de UI interaction
// (120–480ms) por diseño. Loops infinitos que comunican "la app está
// viva" sin pedir atención: breaths, sonar halos, shimmer sweeps,
// ambient blob drift. Si necesitas un valor más rápido es probable
// que sea UI feedback y debería ir en `motionDurations`.
//
// Convención: los valores corresponden a la duración de UN ciclo
// completo del loop (no half-cycle). Cuando un loop usa
// `withSequence(in, out)` con duraciones iguales, dividir entre 2.
export const decorativeDurations = {
  /** Breath cycle — hero/flame/dot scale 1 → ~1.05 → 1. */
  breath:   2800,
  /** Sonar halo expansion — scale 1 → 1.4 + opacity fade. */
  halo:     1800,
  /** Shimmer band sweep — translateX across the parent's width. */
  shimmer:  1400,
  /** Ambient blob drift — large background gradient breath. */
  ambient:  9000,
  /** Cinematic paint-in (logo leaves, single-shot reveals). */
  bloom:    1400,
  /** Slow pulse half-cycle (asesor halo, hoy-card glow). */
  pulse:    1200,
  /** Extra-slow pulse half-cycle (in/out sin loops). */
  pulseSlow: 2400,
  /** Hero structural fade (logo skeleton, slow paint settle). */
  paintSettle: 1100,
  /** Tail / exit fade for cinematic intros (logo pill, hero finish). */
  paintExit: 600,
  /** Fijos Avisos ticker sweep — one full pass of the duplicated chip row (source markup: `@keyframes fijosTicker`, 30s linear infinite). */
  tickerLoop: 30000,
  /** Fijos Avisos "live" dot breath, full cycle (source markup: `@keyframes fijosLive` — opacity 0.4→1→0.4, scale 0.85→1.15→0.85, 1.6s ease-in-out infinite). Half this per withTiming leg. */
  liveDotPulse: 1600,
} as const

export type DecorativeDurationKey = keyof typeof decorativeDurations

export const motionSprings = {
  press:     { damping: 18, stiffness: 380, mass: 0.9 },
  enter:     { damping: 22, stiffness: 210, mass: 1.0 },
  exit:      { damping: 24, stiffness: 260, mass: 1.0 },
  value:     { damping: 24, stiffness: 180, mass: 1.0 },
  celebrate: { damping: 14, stiffness: 260, mass: 0.8 },
  sheet:     { damping: 22, stiffness: 200, mass: 1.0 },
  // Tab content shift — barely-overshooting spring that matches the
  // pill indicator's motion profile. Stiff enough to feel snappy.
  tabShift:  { damping: 26, stiffness: 340, mass: 0.9 },
  // Radial / fan menus (FAB speed-dial). Softer than `enter` so each
  // petal lands with a touch of bounce, signalling "I just unfurled
  // from the FAB". The exit pair is intentionally a `withTiming`
  // curve, not a spring — see `add-quick-actions-overlay.tsx` for
  // why (Modal-unmount latency on critically-damped spring blocked
  // the FAB underneath). Use `motionDurations.exitTab` +
  // `motionEasings.exitStandard` for the radial dismiss.
  radialEnter: { damping: 14, stiffness: 160, mass: 0.9 },
  // Gesture-driven sheet dismiss. Stiff and well-damped so the sheet
  // lands at its destination (off-screen) without overshoot when the
  // user flicks. Callers merge `velocity: Math.max(event.velocityY,
  // <floor>)` so the spring continues the gesture's terminal velocity
  // instead of restarting from zero — that's the bit that makes
  // drag-to-dismiss feel continuous instead of hand-off.
  sheetDismiss: { damping: 32, stiffness: 240, mass: 0.9 },
  // Tab icon focus state — softer than `tabShift` (which animates the
  // pill indicator). Lighter mass + lower stiffness gives the icon a
  // subtle pop as it becomes active, not a snap.
  tabIcon: { damping: 16, stiffness: 180, mass: 0.7 },
} as const

export type MotionSpringKey = keyof typeof motionSprings

export const motionEasings = {
  standard:   Easing.bezier(0.22, 0.9, 0.3, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1.0, 1.0),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1.0),
  // Stack push enter — "ease-out-expo": fast initial take-off, soft
  // settle. Pairs naturally with the parallax on the previous screen.
  enterSmooth: Easing.bezier(0.16, 1.0, 0.3, 1.0),
  // Universal exit curve: ease-in for natural deceleration into the
  // off-screen edge. Used by stack pop and modal close.
  exitStandard: Easing.bezier(0.4, 0.0, 1.0, 1.0),
  // Symmetric inOut, anti-pop. Both extremes of the curve are slow;
  // the middle accelerates. Used for contemplative entrances where
  // the animation has to breathe (e.g. warm post-login splash) rather
  // than proclaim. The cold-start splash uses `enterSmooth` instead —
  // that one has a fast take-off, this one has none.
  warm: Easing.bezier(0.45, 0.0, 0.55, 1.0),
} as const

export const motionStagger = {
  listItem: 40,
  section:  60,
  // Per-petal entry offset for radial / fan menus. Unitless: a fraction
  // of the parent `progress` (0 → 1) used as the start of each petal's
  // interpolation window. With 3 petals at 0.08 spacing, the windows
  // are [0, 0.7] / [0.08, 0.78] / [0.16, 0.86] — enough overlap to read
  // as a single unfurl, enough offset to read as L→R sequence.
  fanProgress: 0.08,
} as const
