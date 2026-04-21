import { describe, expect, it } from 'vitest'
import {
  categoryHues,
  resolveCategoryHue,
  CATEGORY_HUE_KEYS,
} from '@/theme/category-hues'

describe('category hues', () => {
  it('exposes 8 canonical hue keys', () => {
    expect(CATEGORY_HUE_KEYS).toEqual([
      'comida', 'transporte', 'casa', 'salud',
      'ocio', 'servicios', 'ropa', 'otros',
    ])
  })

  it('every canonical hue has light and dark variants with surface + ink', () => {
    for (const key of CATEGORY_HUE_KEYS) {
      const hue = categoryHues[key]
      expect(hue.light.surface).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.light.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.dark.surface).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.dark.ink).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('resolveCategoryHue returns the canonical hue when key is known', () => {
    const hue = resolveCategoryHue('comida')
    expect(hue).toBe(categoryHues.comida)
  })

  it('resolveCategoryHue returns a deterministic fallback hue for unknown ids', () => {
    const hue1 = resolveCategoryHue('abc-123')
    const hue2 = resolveCategoryHue('abc-123')
    expect(hue1).toBe(hue2)
    expect(CATEGORY_HUE_KEYS).toContain(hue1.key)
  })

  it('different unknown ids can map to different hues', () => {
    const keys = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
        .map((id) => resolveCategoryHue(id).key),
    )
    expect(keys.size).toBeGreaterThan(1)
  })
})
