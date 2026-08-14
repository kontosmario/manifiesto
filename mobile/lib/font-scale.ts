import type { StyleProp, TextStyle } from 'react-native'

/**
 * Escala de texto propia de la app — ver spec
 * docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
 *
 * El tamaño del texto responde SOLO a esta preferencia, nunca al
 * fontScale del OS (que rompía la UI). Sin nivel «Sistema» a propósito.
 * Módulo puro sin imports de runtime: testeable en vitest env node.
 */
export type FontScalePreference = 'sm' | 'md' | 'lg' | 'xl'

export const FONT_SCALE_FACTORS: Record<FontScalePreference, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.1,
  xl: 1.2,
}

export function isFontScalePreference(value: unknown): value is FontScalePreference {
  return value === 'sm' || value === 'md' || value === 'lg' || value === 'xl'
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function flattenTextStyle(style: StyleProp<TextStyle>): TextStyle | null {
  if (!style || typeof style !== 'object') return null
  if (Array.isArray(style)) {
    let merged: TextStyle | null = null
    for (const entry of style) {
      const flat = flattenTextStyle(entry as StyleProp<TextStyle>)
      // El `?? {}` no es cosmético: con `merged` inicializado en null, tsc
      // narrowea el operando a null dentro del loop y rechaza el spread.
      if (flat) merged = { ...(merged ?? {}), ...flat }
    }
    return merged
  }
  return style as TextStyle
}

/**
 * Overrides escalados para componer como `[style, overrides]` — así el
 * style original queda intacto y solo se pisan las métricas de fuente.
 *
 * Devuelve null cuando no hay nada que escalar: factor 1 (default), o
 * un style sin `fontSize` declarado (un Text anidado sin fontSize
 * hereda del padre ya escalado; inyectar el default 14 de RN rompería
 * esa herencia).
 */
export function scaledTextOverrides(
  style: StyleProp<TextStyle>,
  factor: number,
): TextStyle | null {
  if (factor === 1) return null
  const flat = flattenTextStyle(style)
  if (typeof flat?.fontSize !== 'number') return null
  const overrides: TextStyle = { fontSize: round1(flat.fontSize * factor) }
  if (typeof flat.lineHeight === 'number') overrides.lineHeight = round1(flat.lineHeight * factor)
  if (typeof flat.letterSpacing === 'number') overrides.letterSpacing = round1(flat.letterSpacing * factor)
  return overrides
}
