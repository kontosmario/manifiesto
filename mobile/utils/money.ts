import { getIntlLocale } from '@/lib/i18n/active-locale'

export type MoneyCurrency = 'ARS' | 'USD'

/**
 * Formatters de DISPLAY locale-aware. El locale se resuelve EN EL MOMENTO de
 * formatear (getIntlLocale lee el idioma activo de i18n), no se congela en un
 * singleton 'es-AR'. Memoizamos un Intl.NumberFormat por (locale + opts) para
 * no reconstruirlo en cada llamada, y exponemos un objeto `{ format }` que
 * delega — así los call sites existentes (`currencyFormatter.format(x)`) siguen
 * funcionando sin cambios mientras el formato sigue al idioma del usuario.
 */
type NumberFormatFactory = { format: (value: number) => string }

function makeLocaleAwareFormatter(
  options: Intl.NumberFormatOptions,
): NumberFormatFactory {
  const cache = new Map<string, Intl.NumberFormat>()
  return {
    format(value: number): string {
      const locale = getIntlLocale()
      let formatter = cache.get(locale)
      if (!formatter) {
        formatter = new Intl.NumberFormat(locale, options)
        cache.set(locale, formatter)
      }
      return formatter.format(value)
    },
  }
}

export const currencyFormatter = makeLocaleAwareFormatter({
  style: 'currency',
  currency: 'ARS',
})

export const usdFormatter = makeLocaleAwareFormatter({
  style: 'currency',
  currency: 'USD',
})

// ⚠️ INPUT — NO locale-aware. Estos tres formatters alimentan
// `formatPriceInputValue`, que renderiza el valor DENTRO del numpad propio de
// la app. El numpad usa SIEMPRE la coma como separador decimal (convención
// fija del input, independiente del idioma de la UI): el parser
// `normalizePriceInput`/`parsePrice` espera coma-decimal y `serializePrice`
// emite coma. Si estos siguieran al idioma activo, en 'en' el field mostraría
// "1,234.56" mientras el parser sigue esperando coma → el monto tipeado se
// rompería. Por eso quedan anclados en 'es-AR'.
const usdInputFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const currencyInputFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const integerInputFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
})

// ⚠️ INPUT — convención fija coma-decimal, NO locale-dependiente. El numpad
// propio de la app emite la coma como separador decimal en todos los idiomas,
// así que el parsing (normalizePriceInput/parsePrice) y la serialización
// (serializePrice) trabajan siempre con coma. Localizar esto rompería el
// contrato con el numpad y con los valores ya serializados.
export function normalizePriceInput(rawValue: string): string {
  const cleaned = rawValue.replace(/[^\d.,]/g, '')
  if (!cleaned) {
    return ''
  }

  const commaIndex = cleaned.indexOf(',')

  let integerPart = commaIndex >= 0 ? cleaned.slice(0, commaIndex) : cleaned
  let decimalPart = commaIndex >= 0 ? cleaned.slice(commaIndex + 1) : ''

  integerPart = integerPart.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (!integerPart) {
    integerPart = '0'
  }

  decimalPart = decimalPart.replace(/[^\d]/g, '').slice(0, 2)

  if (commaIndex >= 0) {
    return decimalPart ? `${integerPart},${decimalPart}` : `${integerPart},`
  }

  return integerPart
}

export function parsePrice(rawValue: string): number {
  const normalized = normalizePriceInput(rawValue)
  if (!normalized) {
    return Number.NaN
  }

  const safeValue = normalized.endsWith(',') ? normalized.slice(0, -1) : normalized
  return Number(safeValue.replace(',', '.'))
}

export function formatPriceInputValue(
  rawValue: string,
  isFocused: boolean,
  currency: MoneyCurrency = 'ARS',
): string {
  if (!rawValue) {
    return ''
  }

  const normalized = normalizePriceInput(rawValue)
  if (!normalized) {
    return ''
  }

  const hasTrailingDecimalSeparator = normalized.endsWith(',')
  const [integerPart = '0', decimalPart = ''] = normalized.split(',')
  const integerValue = Number(integerPart)

  if (!Number.isFinite(integerValue)) {
    return ''
  }

  if (isFocused) {
    const formattedInteger = integerInputFormatter.format(integerValue)
    const focusedPrefix = currency === 'USD' ? 'US$ ' : '$ '

    return hasTrailingDecimalSeparator || decimalPart
      ? `${focusedPrefix}${formattedInteger},${decimalPart}`
      : `${focusedPrefix}${formattedInteger}`
  }

  // Siempre parsear con punto decimal. La rama no-focused antes usaba
  // `normalized` crudo, que en AR trae la COMA decimal (p.ej "139107,83")
  // → Number() daba NaN → devolvía '' y el campo del sheet quedaba VACÍO
  // cuando el monto pre-cargado tenía decimales (bug 2026-06-23: el
  // pre-fill de la reserva acumulada $139.107,83). `parsePrice` ya hacía
  // bien el replace de coma→punto; esto alinea el display con esa lógica.
  const normalizedForParsing = `${integerPart}.${decimalPart || '0'}`
  const parsed = Number(normalizedForParsing)

  if (!Number.isFinite(parsed)) {
    return ''
  }

  return (currency === 'USD' ? usdInputFormatter : currencyInputFormatter).format(parsed)
}

export function serializePrice(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString()
  }

  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
}

export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0)
  }

  const absolute = currencyFormatter.format(Math.abs(value))

  if (value > 0) {
    return `+${absolute}`
  }

  if (value < 0) {
    return `-${absolute}`
  }

  return currencyFormatter.format(0)
}

const homeIntegerFormatter = makeLocaleAwareFormatter({ maximumFractionDigits: 0 })

export function formatMoney(n: number, opts: { zeroAsDash?: boolean } = {}): string {
  if (opts.zeroAsDash && n === 0) return '—'
  return '$' + homeIntegerFormatter.format(Math.round(Math.abs(n)))
}

/** "US$ 841" — entero, sin decimales, separador de miles según idioma activo.
 *  Para mostrar equivalentes en dólares de forma compacta (no usa el currency
 *  style de usdFormatter, que mete ",00"/".00"). */
export function formatUsd(n: number): string {
  return 'US$ ' + homeIntegerFormatter.format(Math.round(Math.abs(n)))
}

const shortDecimalFormatter = makeLocaleAwareFormatter({
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatMoneyWithSign(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${formatMoney(n)}`
}

export function formatMoneyShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  // El separador decimal del tramo "M" sigue al idioma activo ("1,5M" en es,
  // "1.5M" en en); el resto son enteros sin separador.
  if (abs >= 1_000_000)
    return `${sign}$${shortDecimalFormatter.format(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}
