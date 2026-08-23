import { describe, expect, it } from 'vitest'
import {
  flattenBoxShadow,
  flattenShadowRecipes,
  looksLikeBoxShadow,
} from '@/theme/flatten-box-shadow'

// Recetas REALES del vocabulario (neo-tokens.ts) — si cambian allá, estos
// tests protegen que el tier plano siga produciendo capas válidas.
const HERO_LIGHT =
  '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)'
const RING_SELECTED_LIGHT =
  'inset 3px 3px 7px rgba(90,110,70,0.2), inset -3px -3px 7px rgba(255,255,255,0.85), 0 0 0 2.5px #2E7C39'
const CTA_LIGHT = '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)'
const SHEET_LIGHT = '0 -20px 50px rgba(20,30,18,0.35)'
const INSET_SM_LIGHT =
  'inset 2px 2px 5px rgba(151,160,136,0.3), inset -2px -2px 5px rgba(255,255,255,0.8)'

describe('flattenBoxShadow', () => {
  it('hero: conserva la primera capa difuminada (blur capado) + la línea de luz blur-0', () => {
    const flat = flattenBoxShadow(HERO_LIGHT)
    expect(flat).toBe(
      '12px 12px 12px rgba(124,138,110,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
    )
  })

  it('ringSelected: conserva UN inset difuminado + el anillo blur-0 (identidad de selección)', () => {
    const flat = flattenBoxShadow(RING_SELECTED_LIGHT)
    expect(flat).toBe('inset 3px 3px 7px rgba(90,110,70,0.2), 0 0 0 2.5px #2E7C39')
  })

  it('cta: descarta el gloss inset difuminado y capa el blur del key shadow', () => {
    expect(flattenBoxShadow(CTA_LIGHT)).toBe('0 12px 12px rgba(46,116,52,0.4)')
  })

  it('sheet: capa única — sólo se capa el blur', () => {
    expect(flattenBoxShadow(SHEET_LIGHT)).toBe('0 -20px 12px rgba(20,30,18,0.35)')
  })

  it('inset dobles: queda una sola capa inset (blur bajo el cap se conserva tal cual)', () => {
    expect(flattenBoxShadow(INSET_SM_LIGHT)).toBe('inset 2px 2px 5px rgba(151,160,136,0.3)')
  })

  it('respeta el orden original de las capas conservadas', () => {
    // La capa blur-0 va DESPUÉS de la difuminada en la receta original y
    // tiene que seguir después (el orden de pintado importa en RN).
    const flat = flattenBoxShadow(HERO_LIGHT)
    expect(flat.indexOf('12px 12px 12px')).toBeLessThan(flat.indexOf('inset 0 1px 0'))
  })
})

describe('looksLikeBoxShadow', () => {
  it('reconoce recetas de sombra y rechaza gradientes/colores/labels', () => {
    expect(looksLikeBoxShadow(HERO_LIGHT)).toBe(true)
    expect(looksLikeBoxShadow(SHEET_LIGHT)).toBe(true)
    expect(looksLikeBoxShadow('linear-gradient(145deg, #F0F2E7, #E1E4D6)')).toBe(false)
    expect(looksLikeBoxShadow('radial-gradient(circle at 32% 28%, #489350, #2E7434)')).toBe(false)
    expect(looksLikeBoxShadow('#E9EBE0')).toBe(false)
    expect(looksLikeBoxShadow('rgba(46,124,57,0.1)')).toBe(false)
    expect(looksLikeBoxShadow('Sueldo en 2 días')).toBe(false)
  })
})

describe('flattenShadowRecipes', () => {
  it('camina objetos anidados y transforma SOLO strings que son sombras', () => {
    const spec = {
      light: {
        cardShadow: HERO_LIGHT,
        gradientCss: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
        bg: '#DCDFCD',
        nested: { ctaShadow: CTA_LIGHT, radius: 26 },
        list: [SHEET_LIGHT, 'texto suelto'],
      },
    }
    const flat = flattenShadowRecipes(spec)
    expect(flat.light.cardShadow).toBe(flattenBoxShadow(HERO_LIGHT))
    expect(flat.light.gradientCss).toBe(spec.light.gradientCss)
    expect(flat.light.bg).toBe('#DCDFCD')
    expect(flat.light.nested.ctaShadow).toBe(flattenBoxShadow(CTA_LIGHT))
    expect(flat.light.nested.radius).toBe(26)
    expect(flat.light.list[0]).toBe(flattenBoxShadow(SHEET_LIGHT))
    expect(flat.light.list[1]).toBe('texto suelto')
  })

  it('devuelve el MISMO objeto (identidad) cuando el tier plano está apagado', () => {
    const spec = { shadow: HERO_LIGHT }
    expect(flattenShadowRecipes(spec, false)).toBe(spec)
  })
})
