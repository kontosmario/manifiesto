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
} as const

export type MotionDurationKey = keyof typeof motionDurations

// Decorative loop durations — fuera del rango de UI interaction
// (120–480ms) por diseño. Loops infinitos que comunican "la app está
// viva" sin pedir atención: breaths, sonar halos, shimmer sweeps,
// ambient blob drift. Si necesitás un valor más rápido es probable
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
} as const
