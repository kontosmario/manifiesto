import { getIntlLocale } from '@/lib/i18n/active-locale'

export type AmountPrefix = '+' | '-' | null | undefined

export function formatAnimatedAmount(
  value: number,
  // Sin locale explícito sigue al idioma activo (es→es-AR, en→en-US).
  locale: string = getIntlLocale(),
  prefix?: AmountPrefix,
): string {
  const rounded = Math.round(value)
  const isNegative = rounded < 0
  const absolute = Math.abs(rounded)

  const absoluteFormatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(absolute)

  const resolvedPrefix: string =
    prefix === undefined ? (isNegative ? '-' : '') : (prefix ?? '')

  return `${resolvedPrefix}$${absoluteFormatted}`
}
