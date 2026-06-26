// Tokens de timing del flujo auth — spec 2026-06-11 (validados con
// docs/auth-flow-demo.html). Cambiar el feel = cambiar un número aquí.

/** Fade-in del bridge sobre la superficie fern idéntica. */
export const BRIDGE_FADE_IN_MS = 180
/**
 * Piso del momento de marca post-auth (adaptativo: espera además
 * DESTINATION_READY). Ajustado 1200 → 550 tras feedback en device real
 * (2026-06-11): como el boot fern y el bridge son idénticos, el hold
 * largo se lee como "sigue el fondo verde" y no como momento de marca.
 * 550ms cubre fade-in (180) + navegación cubierta y el soar-away (550)
 * pasa a ser EL feedback visual del éxito — total post-FaceID ~1.1s,
 * feel Mercado Pago.
 */
export const BRIDGE_MIN_HOLD_MS = 550
/** Soar-away: translateY -60, scale 1.15, fade out. */
export const SOAR_AWAY_MS = 550
/** Fade del auth stack hacia login en cancel/fail (ya existe en (auth)/_layout). */
export const LOGIN_FALLBACK_FADE_MS = 240
/** Bridge colgado sin DESTINATION_READY → bridge-error(timeout). */
export const SAFETY_TIMEOUT_MS = 15000

export const BRIDGE_SCALE_FROM = 0.97
export const SOAR_SCALE_TO = 1.15
export const SOAR_TRANSLATE_Y = -60
