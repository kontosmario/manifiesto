import { describe, expect, it } from 'vitest'
import { typography, TYPOGRAPHY_PRESET_KEYS } from '@/theme/typography'

describe('typography tokens', () => {
  it('exposes the full expected preset set', () => {
    expect(TYPOGRAPHY_PRESET_KEYS).toEqual([
      'hero',
      'displayLarge',
      'screenTitle',
      'sectionTitle',
      'titleMedium',
      'metricLarge',
      'metricValue',
      'buttonDefault',
      'buttonCompact',
      'bodyLarge',
      'body',
      'bodyEmphasis',
      'bodySmall',
      'eyebrow',
      'fieldLabel',
      'caption',
    ])
  })

  it('hero is the largest at 54 / 900 with tight letter spacing', () => {
    expect(typography.hero.fontSize).toBe(54)
    expect(typography.hero.fontWeight).toBe('900')
    expect(typography.hero.letterSpacing).toBe(-2)
  })

  it('eyebrow is uppercase with positive letter spacing', () => {
    expect(typography.eyebrow.textTransform).toBe('uppercase')
    expect(typography.eyebrow.letterSpacing).toBeGreaterThan(0)
  })

  it('caption exists at 11 / 500', () => {
    expect(typography.caption.fontSize).toBe(11)
    expect(typography.caption.fontWeight).toBe('500')
  })
})
