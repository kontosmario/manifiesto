import type { TextStyle } from 'react-native'

export type TypographyPresetKey =
  | 'hero' | 'displayLarge' | 'screenTitle' | 'sectionTitle' | 'titleMedium'
  | 'metricLarge' | 'metricValue'
  | 'buttonDefault' | 'buttonCompact'
  | 'bodyLarge' | 'body' | 'bodyEmphasis' | 'bodySmall'
  | 'eyebrow' | 'fieldLabel' | 'caption'

export const typography: Record<TypographyPresetKey, TextStyle> = {
  hero:          { fontSize: 54, fontWeight: '900', letterSpacing: -2 },
  displayLarge:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  screenTitle:   { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  sectionTitle:  { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  titleMedium:   { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  metricLarge:   { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  metricValue:   { fontSize: 22, fontWeight: '800' },
  buttonDefault: { fontSize: 15, fontWeight: '700' },
  buttonCompact: { fontSize: 13, fontWeight: '700' },
  bodyLarge:     { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  body:          { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyEmphasis:  { fontSize: 15, fontWeight: '600' },
  bodySmall:     { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  eyebrow:       { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption:       { fontSize: 11, fontWeight: '500' },
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
