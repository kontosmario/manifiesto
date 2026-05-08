import { describe, it, expect } from 'vitest'
import { buildTheme } from '@/theme/palette'

describe('palette home tokens', () => {
  it('exposes heroGradient and hero accent in light mode', () => {
    const t = buildTheme('light')
    // V1 palette migration
    expect(t.colors.heroGradient).toEqual(['#244235', '#1F590D', '#297811', '#297811'])
    expect(t.colors.heroAccent).toBe('#A6EF8F') // V1 palette migration
  })

  it('exposes swapped tokens in dark mode', () => {
    const t = buildTheme('dark')
    // V1 palette migration
    expect(t.colors.heroGradient).toEqual(['#244235', '#1F590D', '#297811', '#297811'])
    expect(t.colors.peachSoft).toBe('#3A2A22')
  })

  it('exposes aurora blob tints, bands, and ambient ring bg', () => {
    const t = buildTheme('light')
    expect(t.colors.auroraA).toBe('rgba(166,239,143,0.35)') // V1 palette migration
    expect(t.colors.auroraB).toBe('rgba(242,167,140,0.28)') // V1 palette migration
    expect(t.colors.auroraC).toBe('rgba(119,231,85,0.22)') // V1 palette migration
    expect(t.colors.greenBand).toBe('#D6EFBA')
    expect(t.colors.redBand).toBe('#F5C6B6')
    expect(t.colors.peachBand).toBe('#F8D1C3') // V1 palette migration
    expect(t.colors.ringBg).toBe('#FAF7F0') // V1 palette migration
    expect(t.colors.cream).toBe('#F6EFE3')
    expect(t.colors.creamCard).toBe('#FFFBF2')
    expect(t.colors.line).toBe('#EFE8D9')
  })
})
