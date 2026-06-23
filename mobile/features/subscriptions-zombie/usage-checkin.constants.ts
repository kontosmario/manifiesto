// Umbrales del check-in de uso de suscripciones (spec 2026-06-23).
// Ajustables: gobiernan la cadencia de re-pregunta y la escalación a flag.

/** Días entre re-preguntas cuando la sub viene con uso bajo/medio. */
export const REASK_DAYS = 15
/** Días entre re-preguntas cuando la última respuesta fue 'mucho' (afloja). */
export const REASK_DAYS_AFTER_HIGH = 35
/** Respuestas negativas consecutivas para el flag suave. */
export const SOFT_FLAG_STREAK = 2
/** Respuestas negativas consecutivas para el flag fuerte (¿cancelar?). */
export const HARD_FLAG_STREAK = 3

/** Score de no-uso por respuesta. mucho=la usa, casi_nunca=no la usa. */
export const USAGE_SCORE = {
  mucho: 0,
  a_veces: 0.5,
  casi_nunca: 1,
} as const

/** Una respuesta cuenta como 'negativa' (suma a la racha) si score >= esto. */
export const NEGATIVE_SCORE_THRESHOLD = 0.5

/** Ventana (días) del ask-al-pagar: solo preguntamos por un pago RECIENTE.
 *  Un pago viejo de un ciclo anterior (sub vencida que NO se pagó el período
 *  actual) NO dispara el check-in — el ask es "acabás de pagar", no "existe
 *  algún pago histórico". Debe ser < REASK_DAYS para no solapar con el re-ask. */
export const PAYMENT_RECENCY_DAYS = 7
