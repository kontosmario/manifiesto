import { getOptionalSkiaModule } from '@/lib/optional-skia'

const compactNumberFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

export function buildCirclePath(
  skia: NonNullable<ReturnType<typeof getOptionalSkiaModule>>,
  cx: number,
  cy: number,
  radius: number,
) {
  const path = skia.Skia.Path.Make()
  path.addCircle(cx, cy, radius)
  return path
}

export function getVisibleRange(start: number, end: number, visibleBoundary: number) {
  if (visibleBoundary <= start) {
    return null
  }

  const visibleEnd = Math.min(end, visibleBoundary)
  const visibleStart = Math.min(start, visibleEnd)

  if (visibleEnd - visibleStart <= 0.0005) {
    return null
  }

  return { visibleEnd, visibleStart }
}

export function mixHexColors(first: string, second: string, weight = 0.5) {
  const normalize = (value: string) => {
    const hex = value.replace('#', '')

    if (hex.length === 3) {
      return hex
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    }

    return hex.padEnd(6, '0').slice(0, 6)
  }

  const firstHex = normalize(first)
  const secondHex = normalize(second)

  const mixed = [0, 2, 4]
    .map((offset) => {
      const start = parseInt(firstHex.slice(offset, offset + 2), 16)
      const end = parseInt(secondHex.slice(offset, offset + 2), 16)
      const value = Math.round(start + (end - start) * weight)
      return value.toString(16).padStart(2, '0')
    })
    .join('')

  return `#${mixed}`
}

export function hexToRgba(value: string, alpha: number) {
  const hex = value.replace('#', '')
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex.padEnd(6, '0').slice(0, 6)

  const red = parseInt(normalized.slice(0, 2), 16)
  const green = parseInt(normalized.slice(2, 4), 16)
  const blue = parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-$' : '$'

  if (absoluteValue >= 1_000_000) {
    return `${prefix}${compactNumberFormatter.format(absoluteValue / 1_000_000)}M`
  }

  if (absoluteValue >= 1_000) {
    return `${prefix}${compactNumberFormatter.format(absoluteValue / 1_000)}k`
  }

  return `${prefix}${compactNumberFormatter.format(absoluteValue)}`
}
