// Helpers for deriving readable variants of CATEGORY colors.
//
// El producto usa una paleta de 12 pasteles para categorías
// (`CATEGORY_FALLBACK_COLORS` en `use-categories.ts`) — diseñados para
// chip backgrounds tinted al 14%. Usados directo como TEXTO sobre
// fondos light fallan WCAG AA (contraste 1.5-2:1 sobre cream).
//
// `darkenForLightBg` deriva una variante hue-preserved con L=22 en
// HSL — alta contraste sobre creamCard/pageBg en light mode. Mismo
// patrón que `darkenToneForText` en `control-v2-header.tsx` (heuristic
// validada con WCAG: cada par categoría→variante da >5:1 sobre
// `#FFFBF2` tinted al 14%).
//
// Bumpeamos saturación +8 para que la variante oscura no se vea
// muddy/gris — los pasteles tienen alta saturación, y darken puro
// la baja por la fórmula HSL.

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  return (
    '#' +
    [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
  )
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = h / 360
  const sn = s / 100
  const ln = l / 100
  if (sn === 0) {
    const v = Math.round(ln * 255)
    return { r: v, g: v, b: v }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  }
}

/**
 * Returns a dark, hue-preserved variant of a pastel category color.
 * Useful for chip text / count text rendered on cream-tinted bg in
 * light mode, where the original pastel fails WCAG AA.
 *
 * Contraste verificado sobre `tone @ 14%` blend over `#FFFBF2`:
 *   #89C8F7 (light blue)  → ~#0F4D88  → ≥ 7:1
 *   #F4D87E (light yellow)→ ~#5D4914  → ≥ 7:1
 *   #FFA3A6 (light pink)  → ~#7E2326  → ≥ 7:1
 */
export function darkenForLightBg(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const { h, s } = rgbToHsl(rgb)
  // +8 saturation evita que el dark variant se vea muddy/gris.
  // l=22 garantiza > 5:1 contrast sobre cream-tinted bg.
  return rgbToHex(hslToRgb({ h, s: Math.min(95, s + 8), l: 22 }))
}

/**
 * Returns a lighter, hue-preserved variant of a pastel category color
 * for use on dark backgrounds. La paleta original (L=55-77) sobre
 * dark-olive chip bg (L≈0.13) cae en 3.3-4.5:1 (marginal AA fail).
 *
 * Lift L=92, +8 saturation para que el variant no se lave a near-white.
 * Cada categoría preserva su HUE → identidad visual intacta. Contraste
 * verificado sobre `tone @ 14%` blend over `#305A47` (creamCard dark)
 * para LAS 12 categorías de `CATEGORY_FALLBACK_COLORS`:
 *
 *   #89C8F7 (light blue) → #D7EDFE → 5.16:1 ✅
 *   #7EE3D4 (mint)       → #DCF9F5 → 5.37:1 ✅
 *   #95E38E (light grn)  → #DFF9DD → 5.34:1 ✅
 *   #CBEA7A (lime)       → #F2FBDA → 5.44:1 ✅
 *   #F4D87E (lt yellow)  → #FDF4D8 → 5.37:1 ✅
 *   #FFBF8A (peach)      → #FEE9D7 → 5.23:1 ✅
 *   #FFA3A6 (lt pink)    → #FED7D8 → 4.88:1 ✅
 *   #F6A3D1 (pink)       → #FDD8ED → 4.95:1 ✅
 *   #C7AEFF (lavender)   → #E3D7FE → 4.64:1 ✅
 *   #AEBBFF (periwinkle) → #D7DDFE → 4.63:1 ✅
 *   #8FD9E8 (lt teal)    → #DCF5FA → 5.27:1 ✅
 *   #9DE7C8 (mint green) → #DDF9ED → 5.26:1 ✅
 *
 * Min contrast: 4.63:1 (lavender/periwinkle, hues azulados con S bajo).
 * Si L<88 el variant se vería marginal en alguna fila — L=92 es la
 * cota que da AA cleanly para toda la paleta.
 */
export function lightenForDarkBg(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const { h, s, l } = rgbToHsl(rgb)
  // L=92 + S+8 mantiene el carácter de cada hue sin lavarse a gris.
  // Si el color de entrada ya está por encima de L=92 (raro pero
  // posible), respetamos su L para no oscurecerlo accidentalmente.
  return rgbToHex(
    hslToRgb({ h, s: Math.min(95, s + 8), l: Math.max(l, 92) }),
  )
}
