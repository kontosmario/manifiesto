/**
 * Ventana de la fuente de actividad del jardín. Archivo SIN dependencias
 * (ni React ni Supabase) para poder importarlo desde el repositorio, los
 * hooks y los tests sin arrastrar nada.
 */

/**
 * Días hacia atrás que trae la consulta de actividad.
 *
 * La grilla pinta como mucho 5 semanas (`GARDEN_ROWS`), o sea 35 días, y el
 * cierre de semana mira la semana anterior. 90 días es ~2,5× esa ventana: da
 * margen para husos horarios, semanas incompletas y el ancla del primer brote,
 * sin traerse años de historial en cada mount (el jardín se monta en 5 lugares,
 * incluidos widgets de Home).
 */
export const GARDEN_ACTIVITY_WINDOW_DAYS = 90

/**
 * Primer día (ISO `YYYY-MM-DD`) que la consulta de actividad tiene que traer.
 *
 * Se ancla al MEDIODÍA UTC antes de restar días: restar múltiplos exactos de
 * 24 h desde una hora cualquiera corre la fecha un día entero cuando el día
 * local dura 23 h (cambio de horario), y la ventana quedaría corrida. Mismo
 * criterio que usa el resto del jardín para desplazar días.
 */
export function gardenActivityWindowStartIso(
  today: Date,
  days: number = GARDEN_ACTIVITY_WINDOW_DAYS,
): string {
  const noonUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    12,
  )
  return new Date(noonUtc - days * 86_400_000).toISOString().slice(0, 10)
}
