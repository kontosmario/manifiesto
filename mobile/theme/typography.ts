import type { TextStyle } from 'react-native'

/**
 * Rediseño 2026-07 — Nunito en toda la app.
 *
 * Cada peso es un face estático propio (cargado en app/_layout.tsx vía
 * @expo-google-fonts/nunito), así que el fontFamily se resuelve por peso.
 * Mantenemos también fontWeight en los presets: los faces registrados
 * tienen el peso intrínseco correcto, y los overrides inline existentes
 * (`{ ...typography.body, fontWeight: '700' }`) siguen siendo inocuos.
 */
export function nunitoFamily(weight: TextStyle['fontWeight']): string {
  switch (String(weight)) {
    case '500': return 'Nunito_500Medium'
    case '600': return 'Nunito_600SemiBold'
    case '700': return 'Nunito_700Bold'
    case '800': return 'Nunito_800ExtraBold'
    case '900': return 'Nunito_900Black'
    default:    return 'Nunito_400Regular'
  }
}

/**
 * CAJA DE LÍNEA SEGURA — el `lineHeight` mínimo que no recorta el glifo.
 *
 * En iOS, RN fija `minimum/maximumLineHeight` al valor declarado
 * (`RCTAttributedTextUtils.mm:226-227`) y sólo re-centra el glifo con un
 * baseline offset si ese valor es ≥ la métrica natural de la fuente
 * (`:328` → `if (maximumLineHeight < maximumFontLineHeight) return`).
 * Por debajo NO hay offset: la caja se comprime contra el descendente y
 * el ascendente queda GUILLOTINADO, porque `RCTParagraphComponentView`
 * dibuja clipeado a sus bounds. En Android no pasa (`CustomLineHeightSpan`
 * reparte el leading en dos mitades). En CSS tampoco: el glifo sobresale
 * de la caja sin recortarse — por eso un `line-height:1` transcrito de un
 * handoff web se ve perfecto en el navegador y cortado en device.
 *
 * Medido sobre `Nunito_900Black.ttf` (upem 1000): descendente `0.353 em`,
 * lineHeight natural `1.364 em`. Con `L < 1.364·S` el ascendente
 * disponible es `L − 0.353·S`, así que un glifo de altura `yMax` se
 * recorta si `L < (yMax + 0.353)·S`. Peor caso por familia de glifos:
 *
 *   `Ú` `Á` `É` (mayúscula acentuada)  yMax 0.959 → **1.312**
 *   `$`                                yMax 0.829 → **1.182**
 *   `ú` `ó` `í` (minúscula acentuada)   yMax 0.788 → 1.141
 *   dígitos · mayúsculas sin acento     yMax 0.716 → 1.069
 *   `+`                                 yMax 0.537 → 0.890
 *
 * (Ese `+` es la firma del bug: en un monto a `lineHeight:1` sobrevive
 * solo él y el número se ve como un "+" suelto.)
 */
export const NUNITO_SAFE_LH = 1.32
/** Charset controlado de números/moneda (`0-9 . , + − $ % º`): el peor
 *  caso es `$` (1.182), así que 1.2 alcanza y conserva el interlineado
 *  apretado que los diseños piden para las cifras grandes. */
export const NUNITO_SAFE_LH_NUMERIC = 1.2

/**
 * `lineHeight` en puntos, elevado al piso seguro. Usar SIEMPRE en lugar
 * de multiplicar a mano — un ratio por debajo del piso recorta el glifo.
 *
 *   lineHeight: safeLineHeight(31, 1.12)              → 40.9 (elevado)
 *   lineHeight: safeLineHeight(22, 1, { numeric: true }) → 26.4
 */
export function safeLineHeight(
  fontSize: number,
  mult: number,
  opts?: { numeric?: boolean },
): number {
  const floor = opts?.numeric ? NUNITO_SAFE_LH_NUMERIC : NUNITO_SAFE_LH
  return Math.round(fontSize * Math.max(mult, floor) * 10) / 10
}

export type TypographyPresetKey =
  | 'hero' | 'displayLarge' | 'screenTitle' | 'sectionTitle' | 'titleMedium'
  | 'metricLarge' | 'metricValue'
  | 'buttonDefault' | 'buttonCompact'
  | 'bodyLarge' | 'body' | 'bodyEmphasis' | 'bodySmall'
  | 'eyebrow' | 'fieldLabel' | 'caption'

export const typography: Record<TypographyPresetKey, TextStyle> = {
  hero:          { fontSize: 54, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -2 },
  displayLarge:  { fontSize: 40, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -1.5 },
  screenTitle:   { fontSize: 32, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.8 },
  sectionTitle:  { fontSize: 22, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.3 },
  titleMedium:   { fontSize: 18, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.2 },
  metricLarge:   { fontSize: 28, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.5 },
  metricValue:   { fontSize: 22, fontWeight: '800', fontFamily: nunitoFamily('800') },
  buttonDefault: { fontSize: 15, fontWeight: '700', fontFamily: nunitoFamily('700') },
  buttonCompact: { fontSize: 13, fontWeight: '700', fontFamily: nunitoFamily('700') },
  bodyLarge:     { fontSize: 15, fontWeight: '400', fontFamily: nunitoFamily('400'), lineHeight: 22 },
  body:          { fontSize: 14, fontWeight: '400', fontFamily: nunitoFamily('400'), lineHeight: 20 },
  bodyEmphasis:  { fontSize: 15, fontWeight: '600', fontFamily: nunitoFamily('600') },
  bodySmall:     { fontSize: 13, fontWeight: '400', fontFamily: nunitoFamily('400'), lineHeight: 18 },
  eyebrow:       { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldLabel:    { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), letterSpacing: 0.8, textTransform: 'uppercase' },
  caption:       { fontSize: 11, fontWeight: '500', fontFamily: nunitoFamily('500') },
}

export const TYPOGRAPHY_PRESET_KEYS: TypographyPresetKey[] = [
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
]
