import { describe, expect, it } from 'vitest'
import { buildTheme, brand } from '@/theme/palette'

describe('palette tokens', () => {
  it('brand constants are cross-mode identical', () => {
    expect(brand.deep).toBe('#329315') // V1 palette migration
    expect(brand.bright).toBe('#A6EF8F') // V1 palette migration
    expect(brand.surfaceSoft).toBe('rgba(166,239,143,0.12)') // V1 palette migration
  })

  it('light theme has warm canvas and deep-green text', () => {
    const theme = buildTheme('light')
    expect(theme.colors.canvas).toBe('#F4F2ED')
    expect(theme.colors.surface).toBe('#FFFFFF')
    expect(theme.colors.text).toBe('#12211A') // V1 palette migration
  })

  it('dark theme has deep canvas and pale text', () => {
    const theme = buildTheme('dark')
    expect(theme.colors.canvas).toBe('#12211A') // V1 palette migration
    expect(theme.colors.surface).toBe('#102018')
    expect(theme.colors.text).toBe('#F2EAD3') // V1 palette migration
  })

  it('both modes expose brand constants on theme.brand', () => {
    expect(buildTheme('light').brand.deep).toBe('#329315') // V1 palette migration
    expect(buildTheme('dark').brand.bright).toBe('#A6EF8F') // V1 palette migration
  })
})

describe('spacing tokens', () => {
  it('uses 4-base scale', () => {
    const theme = buildTheme('light')
    expect(theme.spacing).toEqual({
      xxs: 4,
      xs:  8,
      sm:  12,
      md:  16,
      lg:  24,
      xl:  32,
      xxl: 48,
    })
  })

})

describe('radii tokens', () => {
  it('exposes xs/sm/md/lg/xl/2xl/pill radii', () => {
    const theme = buildTheme('light')
    expect(theme.radii).toEqual({
      xs:  8,
      sm:  10,
      md:  14,
      lg:  18,
      xl:  22,
      '2xl': 28,
      pill: 999,
    })
  })
})
