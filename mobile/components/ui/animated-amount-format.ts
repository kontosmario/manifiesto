export type AmountPrefix = '+' | '-' | null | undefined

export function formatAnimatedAmount(
  value: number,
  locale: string = 'es-AR',
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
