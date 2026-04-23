export type MoneyCurrency = 'ARS' | 'USD'

export const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

export const usdFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
})

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

  const normalizedForParsing = hasTrailingDecimalSeparator
    ? `${integerPart}.${decimalPart || '0'}`
    : normalized
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

export function formatUsdFromArs(arsValue: number, usdExchangeRate: number): string {
  if (!Number.isFinite(arsValue) || !Number.isFinite(usdExchangeRate) || usdExchangeRate <= 0) {
    return usdFormatter.format(0)
  }

  return usdFormatter.format(arsValue / usdExchangeRate)
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: MoneyCurrency,
  toCurrency: MoneyCurrency,
  usdExchangeRate: number,
): number {
  if (!Number.isFinite(amount) || !Number.isFinite(usdExchangeRate) || usdExchangeRate <= 0) {
    return Number.NaN
  }

  if (fromCurrency === toCurrency) {
    return amount
  }

  if (fromCurrency === 'USD' && toCurrency === 'ARS') {
    return amount * usdExchangeRate
  }

  return amount / usdExchangeRate
}
