import { describe, expect, it } from 'vitest'
import {
  FONT_SCALE_FACTORS,
  isFontScalePreference,
  scaledTextOverrides,
} from '@/lib/font-scale'

describe('FONT_SCALE_FACTORS', () => {
  it('define los 4 niveles del spec con md=1 como default de diseño', () => {
    expect(FONT_SCALE_FACTORS).toEqual({ sm: 0.9, md: 1, lg: 1.1, xl: 1.2 })
  })
})

describe('isFontScalePreference', () => {
  it('acepta los 4 niveles', () => {
    for (const p of ['sm', 'md', 'lg', 'xl']) {
      expect(isFontScalePreference(p)).toBe(true)
    }
  })
  it('rechaza lo demás (incluye null del storage y valores viejos)', () => {
    for (const v of [null, undefined, '', 'system', 'MD', 1, {}]) {
      expect(isFontScalePreference(v)).toBe(false)
    }
  })
})

describe('scaledTextOverrides', () => {
  it('con factor 1 devuelve null (fast path: ni aplana)', () => {
    expect(scaledTextOverrides({ fontSize: 14 }, 1)).toBeNull()
  })

  it('sin fontSize declarado devuelve null: un Text anidado hereda del padre ya escalado', () => {
    expect(scaledTextOverrides({ color: 'red', lineHeight: 20 }, 1.2)).toBeNull()
    expect(scaledTextOverrides(undefined, 1.2)).toBeNull()
    expect(scaledTextOverrides(null, 1.2)).toBeNull()
  })

  it('escala fontSize, lineHeight y letterSpacing; no toca el resto', () => {
    const overrides = scaledTextOverrides(
      { fontSize: 20, lineHeight: 28, letterSpacing: -1, color: 'red' },
      1.1,
    )
    expect(overrides).toEqual({ fontSize: 22, lineHeight: 30.8, letterSpacing: -1.1 })
  })

  it('aplana arrays anidados con la semántica de RN: el último gana, falsy se ignora', () => {
    const style = [
      { fontSize: 14, lineHeight: 20 },
      false as const,
      [undefined, { fontSize: 22 }],
    ]
    expect(scaledTextOverrides(style, 1.2)).toEqual({ fontSize: 26.4, lineHeight: 24 })
  })

  it('redondea a 1 decimal (sin ruido flotante)', () => {
    expect(scaledTextOverrides({ fontSize: 13 }, 1.1)).toEqual({ fontSize: 14.3 })
  })

  // Supuesto que sostiene a `AnimatedText` (app-text): el style de un texto
  // animado es un array donde conviven estilos estáticos y el objeto que
  // devuelve `useAnimatedStyle` —un `{ initial, viewDescriptors }` plano, sin
  // métricas de fuente—. Aplanarlo para leer el `fontSize` tiene que ser
  // inocuo: ni aporta claves ni tapa las del estilo estático.
  it('ignora el objeto de useAnimatedStyle: escala el fontSize estático igual', () => {
    const animatedStyle = {
      initial: { value: { color: 'red' }, updater: () => ({ color: 'red' }) },
      viewDescriptors: {},
    }
    const style = [{ fontSize: 20, lineHeight: 24 }, animatedStyle]
    expect(scaledTextOverrides(style, 1.2)).toEqual({ fontSize: 24, lineHeight: 28.8 })
  })
})
