import { describe, it, expect } from 'vitest'
import { buildTheme } from '@/theme/palette'

describe('palette home tokens', () => {
  it('exposes heroGradient and hero accent in light mode', () => {
    const t = buildTheme('light')
    expect(t.colors.heroGradient).toEqual(['#0A2E1E', '#0E3A26', '#1B6B42', '#2DA15E'])
    expect(t.colors.heroAccent).toBe('#C7EE9C')
  })

  it('exposes swapped tokens in dark mode', () => {
    const t = buildTheme('dark')
    expect(t.colors.heroGradient).toEqual(['#133827', '#1F6B43', '#2E9A5F', '#2E9A5F'])
    expect(t.colors.peachSoft).toBe('#3A2A22')
  })

  it('exposes aurora blob tints, bands, and ambient ring bg', () => {
    const t = buildTheme('light')
    expect(t.colors.auroraA).toBe('rgba(199,238,156,0.35)')
    expect(t.colors.auroraB).toBe('rgba(247,181,138,0.28)')
    expect(t.colors.auroraC).toBe('rgba(141,214,106,0.22)')
    expect(t.colors.greenBand).toBe('#D6EFBA')
    expect(t.colors.redBand).toBe('#F5C6B6')
    expect(t.colors.peachBand).toBe('#FADFC8')
    expect(t.colors.ringBg).toBe('#F6EFE3')
    expect(t.colors.cream).toBe('#F6EFE3')
    expect(t.colors.creamCard).toBe('#FFFBF2')
    expect(t.colors.line).toBe('#EFE8D9')
  })
})
