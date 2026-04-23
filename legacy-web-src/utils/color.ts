import type { CSSProperties } from 'react'

export function normalizeHexColor(color: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#126782'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex)
  const value = normalized.slice(1)

  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)

  if (![r, g, b].every(Number.isFinite)) {
    return null
  }

  return { r, g, b }
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return `rgba(18, 103, 130, ${alpha})`
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function shiftHexColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return '#126782'
  }

  const shift = (value: number) => Math.max(0, Math.min(255, value + amount))
  const toHex = (value: number) => value.toString(16).padStart(2, '0')

  return `#${toHex(shift(rgb.r))}${toHex(shift(rgb.g))}${toHex(shift(rgb.b))}`
}

export function buildCategoryTabStyle(color: string): CSSProperties {
  const accent = normalizeHexColor(color)

  return {
    '--category-tab-border': hexToRgba(accent, 0.24),
    '--category-tab-bg': hexToRgba(accent, 0.1),
    '--category-tab-active-start': shiftHexColor(accent, -4),
    '--category-tab-active-end': shiftHexColor(accent, -16),
    '--category-tab-shadow': hexToRgba(accent, 0.24),
  } as CSSProperties
}
