export type CategoryHueKey =
  | 'comida' | 'transporte' | 'casa' | 'salud'
  | 'ocio' | 'servicios' | 'ropa' | 'otros'

export const CATEGORY_HUE_KEYS: readonly CategoryHueKey[] = [
  'comida', 'transporte', 'casa', 'salud',
  'ocio', 'servicios', 'ropa', 'otros',
] as const

export interface CategoryHueVariant {
  surface: string
  ink: string
}

export interface CategoryHue {
  key: CategoryHueKey
  light: CategoryHueVariant
  dark: CategoryHueVariant
}

export const categoryHues: Record<CategoryHueKey, CategoryHue> = {
  comida:    { key: 'comida',    light: { surface: '#FCE8D7', ink: '#8A4A1A' }, dark: { surface: '#3A2C20', ink: '#E8B892' } },
  transporte:{ key: 'transporte',light: { surface: '#DDE8F5', ink: '#2A4E7A' }, dark: { surface: '#1C2938', ink: '#A8C4E8' } },
  casa:      { key: 'casa',      light: { surface: '#E2EDDF', ink: '#2A5030' }, dark: { surface: '#1E2A1E', ink: '#A8C8AC' } },
  salud:     { key: 'salud',     light: { surface: '#F4DDDC', ink: '#8A3530' }, dark: { surface: '#3A2626', ink: '#E8A8A4' } },
  ocio:      { key: 'ocio',      light: { surface: '#E7DDF2', ink: '#5A3E8A' }, dark: { surface: '#2D2538', ink: '#C4A8E0' } },
  servicios: { key: 'servicios', light: { surface: '#F5EDD6', ink: '#7A5A1C' }, dark: { surface: '#342D1C', ink: '#E8CE8A' } },
  ropa:      { key: 'ropa',      light: { surface: '#E4DFD3', ink: '#5A4A30' }, dark: { surface: '#2D2A22', ink: '#C8B89A' } },
  otros:     { key: 'otros',     light: { surface: '#DCE5E5', ink: '#425252' }, dark: { surface: '#1E2626', ink: '#A8B8B8' } },
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function resolveCategoryHue(categoryKeyOrId: string): CategoryHue {
  if ((CATEGORY_HUE_KEYS as readonly string[]).includes(categoryKeyOrId)) {
    return categoryHues[categoryKeyOrId as CategoryHueKey]
  }
  const index = hashString(categoryKeyOrId) % CATEGORY_HUE_KEYS.length
  return categoryHues[CATEGORY_HUE_KEYS[index]]
}
