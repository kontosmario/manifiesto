function clampAlpha(alpha: number) {
  return Math.max(0, Math.min(alpha, 1))
}

function normalizeHexColor(value: string) {
  const hex = value.replace('#', '').trim()

  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
  }

  if (hex.length === 6) {
    return hex
  }

  if (hex.length === 8) {
    return hex.slice(0, 6)
  }

  return null
}

export function withAlpha(color: string, alpha: number) {
  const safeAlpha = clampAlpha(alpha)
  const normalizedHex = normalizeHexColor(color)

  if (normalizedHex) {
    const red = parseInt(normalizedHex.slice(0, 2), 16)
    const green = parseInt(normalizedHex.slice(2, 4), 16)
    const blue = parseInt(normalizedHex.slice(4, 6), 16)

    return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`
  }

  const rgbMatch = color.match(/^rgba?\((.+)\)$/i)
  if (!rgbMatch) {
    return color
  }

  const [red = '0', green = '0', blue = '0'] = rgbMatch[1]
    .split(',')
    .map((part) => part.trim())

  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`
}
