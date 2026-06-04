// mobile/utils/date-format.ts
//
// Constantes y helpers de formato de fecha es-AR. Centralizado para
// evitar duplicación que existía en use-fijos-controller.ts y otros.

export const MONTH_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

export const WEEKDAY_SHORT = [
  'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb',
] as const

/** "20 may" — sin año, fechas dentro del ciclo activo. */
export function formatDayMonthShort(date: Date): string {
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}

/** "vie 20 may" — variante con día de la semana. */
export function formatWeekdayDayMonth(date: Date): string {
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}
