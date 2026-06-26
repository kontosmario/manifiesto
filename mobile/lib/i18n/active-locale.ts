import i18n from '@/lib/i18n'

/** Locale BCP47 para Intl según el idioma activo. es→es-AR (formato LATAM 1.234,56), en→en-US (1,234.56). */
export function getIntlLocale(): string {
  return i18n.language === 'en' ? 'en-US' : 'es-AR'
}

/**
 * Devuelve un Intl.DateTimeFormat para el idioma activo, memoizado por
 * (locale + opts serializadas). Reemplaza a los singletons module-level
 * `new Intl.DateTimeFormat('es-AR', …)`: el formato sigue al idioma sin
 * reconstruir el formatter en cada render.
 */
const dateTimeCache = new Map<string, Intl.DateTimeFormat>()
export function getDateTimeFormat(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const locale = getIntlLocale()
  const key = locale + '|' + JSON.stringify(options)
  let formatter = dateTimeCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    dateTimeCache.set(key, formatter)
  }
  return formatter
}

/**
 * Devuelve un Intl.NumberFormat para el idioma activo, memoizado por
 * (locale + opts serializadas). Análogo a getDateTimeFormat para números.
 */
const numberCache = new Map<string, Intl.NumberFormat>()
export function getNumberFormat(
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const locale = getIntlLocale()
  const key = locale + '|' + JSON.stringify(options)
  let formatter = numberCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberCache.set(key, formatter)
  }
  return formatter
}
