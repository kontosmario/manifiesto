export interface DigitColumns {
  /** Digits of the integer part, left-to-right. */
  integer: number[]
  /** Digits of the fractional part, padded with trailing zeros to fractionDigits length. */
  fraction: number[]
}

/**
 * Splits a non-negative number into its integer and fractional digits
 * suitable for rendering each digit in its own animated column.
 *
 * Rounding follows `toFixed(fractionDigits)` semantics so what we
 * animate matches what the caller would print as a fallback string.
 */
export function computeDigitColumns(
  value: number,
  fractionDigits: number,
): DigitColumns {
  if (value < 0 || !Number.isFinite(value)) {
    throw new Error(`computeDigitColumns: value must be non-negative finite, got ${value}`)
  }
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new Error(`computeDigitColumns: fractionDigits must be a non-negative integer, got ${fractionDigits}`)
  }

  const fixed = value.toFixed(fractionDigits)
  const [intPart, fracPart = ''] = fixed.split('.')

  const integer = intPart.split('').map((c) => Number(c))
  const fraction = fracPart.split('').map((c) => Number(c))

  return { integer, fraction }
}
