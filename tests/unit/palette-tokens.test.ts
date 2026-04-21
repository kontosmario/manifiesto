import { describe, expect, it } from 'vitest'
import { buildTheme, brand } from '@/theme/palette'

describe('palette tokens', () => {
  it('brand constants are cross-mode identical', () => {
    expect(brand.deep).toBe('#0F2E1F')
    expect(brand.bright).toBe('#7AD8A3')
    expect(brand.surfaceSoft).toBe('rgba(122,216,163,0.12)')
  })

  it('light theme has warm canvas and deep-green text', () => {
    const theme = buildTheme('light')
    expect(theme.colors.canvas).toBe('#F4F2ED')
    expect(theme.colors.surface).toBe('#FFFFFF')
    expect(theme.colors.text).toBe('#0F2E1F')
  })

  it('dark theme has deep canvas and pale text', () => {
    const theme = buildTheme('dark')
    expect(theme.colors.canvas).toBe('#0A1A12')
    expect(theme.colors.surface).toBe('#102018')
    expect(theme.colors.text).toBe('#F8FBF8')
  })

  it('both modes expose brand constants on theme.brand', () => {
    expect(buildTheme('light').brand.deep).toBe('#0F2E1F')
    expect(buildTheme('dark').brand.bright).toBe('#7AD8A3')
  })
})
