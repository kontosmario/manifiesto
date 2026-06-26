// mobile/utils/date-format.ts
//
// Helpers de formato de fecha locale-aware (es↔en). Centralizado para
// evitar la duplicación que existía en use-fijos-controller.ts y otros.
//
// El idioma se resuelve EN EL MOMENTO de formatear vía getIntlLocale(), de modo
// que el mes/día abreviado siguen al idioma activo de la UI ("may" en es,
// "May" en en). Memoizamos un Intl.DateTimeFormat por (locale + tipo) para no
// reconstruirlo en cada llamada.

import { getIntlLocale } from '@/lib/i18n/active-locale'

const monthShortCache = new Map<string, Intl.DateTimeFormat>()
const weekdayShortCache = new Map<string, Intl.DateTimeFormat>()

function monthShortFormatter(): Intl.DateTimeFormat {
  const locale = getIntlLocale()
  let formatter = monthShortCache.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short' })
    monthShortCache.set(locale, formatter)
  }
  return formatter
}

function weekdayShortFormatter(): Intl.DateTimeFormat {
  const locale = getIntlLocale()
  let formatter = weekdayShortCache.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    weekdayShortCache.set(locale, formatter)
  }
  return formatter
}

/** Mes abreviado del idioma activo, p.ej. "may" / "May". */
export function monthShort(date: Date): string {
  return monthShortFormatter().format(date)
}

/** Día de la semana abreviado del idioma activo, p.ej. "vie" / "Fri". */
export function weekdayShort(date: Date): string {
  return weekdayShortFormatter().format(date)
}

/** "20 may" — sin año, fechas dentro del ciclo activo. */
export function formatDayMonthShort(date: Date): string {
  return `${date.getDate()} ${monthShort(date)}`
}

/** "vie 20 may" — variante con día de la semana. */
export function formatWeekdayDayMonth(date: Date): string {
  return `${weekdayShort(date)} ${date.getDate()} ${monthShort(date)}`
}
