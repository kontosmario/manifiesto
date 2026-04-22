interface NumpadLimits {
  maxIntegerDigits: number
  maxDecimalDigits: number
}

function splitOnComma(raw: string): { integer: string; decimal: string | null } {
  const index = raw.indexOf(',')
  if (index === -1) return { integer: raw, decimal: null }
  return { integer: raw.slice(0, index), decimal: raw.slice(index + 1) }
}

export function appendDigit(raw: string, digit: string, limits: NumpadLimits): string {
  if (raw === '' && digit === '0') return ''
  const { integer, decimal } = splitOnComma(raw)
  if (decimal === null) {
    if (integer.length >= limits.maxIntegerDigits) return raw
    return `${integer}${digit}`
  }
  if (decimal.length >= limits.maxDecimalDigits) return raw
  return `${integer},${decimal}${digit}`
}

export function appendComma(raw: string): string {
  if (raw.includes(',')) return raw
  if (raw === '') return '0,'
  return `${raw},`
}

export function backspace(raw: string): string {
  if (raw.length === 0) return ''
  return raw.slice(0, -1)
}

export function clearAll(): string {
  return ''
}
