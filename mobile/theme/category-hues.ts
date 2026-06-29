export type CategoryHueKey =
  | 'comida' | 'restaurante' | 'supermercado'
  | 'transporte' | 'viajes'
  | 'casa' | 'servicios' | 'suscripciones'
  | 'salud' | 'belleza'
  | 'ocio' | 'deporte'
  | 'educacion' | 'tecnologia'
  | 'mascotas' | 'ropa' | 'regalos'
  | 'inversiones'
  | 'otros'

export const CATEGORY_HUE_KEYS: readonly CategoryHueKey[] = [
  'comida', 'restaurante', 'supermercado',
  'transporte', 'viajes',
  'casa', 'servicios', 'suscripciones',
  'salud', 'belleza',
  'ocio', 'deporte',
  'educacion', 'tecnologia',
  'mascotas', 'ropa', 'regalos',
  'inversiones',
  'otros',
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

// Each category gets its own warm/cool hue family. Surface is the soft
// pastel used for the badge background; ink is the saturated tone used
// for the icon glyph and selected-state border. Pairs are tuned for
// AA contrast on both light and dark themes.
export const categoryHues: Record<CategoryHueKey, CategoryHue> = {
  // Comida / cocina diaria — durazno cálido
  comida:        { key: 'comida',        light: { surface: '#FCE8D7', ink: '#8A4A1A' }, dark: { surface: '#633A17', ink: '#E8B892' } },
  // Restaurantes / comer afuera — rojo coral
  restaurante:   { key: 'restaurante',   light: { surface: '#FCDDD3', ink: '#A0381F' }, dark: { surface: '#632A17', ink: '#F0A892' } },
  // Supermercado — verde lima
  supermercado:  { key: 'supermercado',  light: { surface: '#E5F0CC', ink: '#3F6018' }, dark: { surface: '#465B15', ink: '#BCD68A' } },
  // Transporte público / nafta — azul
  transporte:    { key: 'transporte',    light: { surface: '#DDE8F5', ink: '#2A4E7A' }, dark: { surface: '#173A63', ink: '#A8C4E8' } },
  // Viajes / hotel / vuelos — celeste cielo
  viajes:        { key: 'viajes',        light: { surface: '#D4ECF4', ink: '#1F5C75' }, dark: { surface: '#175063', ink: '#A0CFE0' } },
  // Casa / alquiler / hogar — verde bosque
  casa:          { key: 'casa',          light: { surface: '#E2EDDF', ink: '#2A5030' }, dark: { surface: '#235715', ink: '#A8C8AC' } },
  // Servicios (luz, gas, internet) — amarillo mostaza
  servicios:     { key: 'servicios',     light: { surface: '#F5EDD6', ink: '#7A5A1C' }, dark: { surface: '#635017', ink: '#E8CE8A' } },
  // Suscripciones / streaming — magenta
  suscripciones: { key: 'suscripciones', light: { surface: '#F2DDEC', ink: '#8A2D6A' }, dark: { surface: '#63174D', ink: '#E8A8D0' } },
  // Salud / farmacia / médico — coral suave
  salud:         { key: 'salud',         light: { surface: '#F4DDDC', ink: '#8A3530' }, dark: { surface: '#631A17', ink: '#E8A8A4' } },
  // Belleza / peluquería / cosmética — rosa pastel
  belleza:       { key: 'belleza',       light: { surface: '#F8DDE8', ink: '#9C3A66' }, dark: { surface: '#631736', ink: '#F0A8C0' } },
  // Ocio / cine / bar — violeta
  ocio:          { key: 'ocio',          light: { surface: '#E7DDF2', ink: '#5A3E8A' }, dark: { surface: '#3B1763', ink: '#C4A8E0' } },
  // Deporte / gym — naranja vibrante
  deporte:       { key: 'deporte',       light: { surface: '#FCE2C8', ink: '#A04C12' }, dark: { surface: '#633D17', ink: '#F0B888' } },
  // Educación / cursos / libros — índigo
  educacion:     { key: 'educacion',     light: { surface: '#DDDFF0', ink: '#3A3D80' }, dark: { surface: '#171F63', ink: '#AAB0E0' } },
  // Tecnología / gadgets — cyan
  tecnologia:    { key: 'tecnologia',    light: { surface: '#D0EDED', ink: '#1F6068', }, dark: { surface: '#155B5B', ink: '#9CD2D8' } },
  // Mascotas — teal verde
  mascotas:      { key: 'mascotas',      light: { surface: '#D2EDE0', ink: '#1F6A4E' }, dark: { surface: '#165F3C', ink: '#9CDABA' } },
  // Ropa / vestimenta — beige tierra
  ropa:          { key: 'ropa',          light: { surface: '#E4DFD3', ink: '#5A4A30' }, dark: { surface: '#56441B', ink: '#C8B89A' } },
  // Regalos — rosa intenso
  regalos:       { key: 'regalos',       light: { surface: '#F8DCD2', ink: '#8E2F40' }, dark: { surface: '#632B17', ink: '#F0A8B0' } },
  // Inversiones / plazo fijo / bonos — oro cálido (sugiere crecimiento)
  inversiones:   { key: 'inversiones',   light: { surface: '#F5E6BD', ink: '#7A5A1C' }, dark: { surface: '#634F17', ink: '#E8CC7A' } },
  // Otros — gris-azul neutro
  otros:         { key: 'otros',         light: { surface: '#DCE5E5', ink: '#425252' }, dark: { surface: '#204B4B', ink: '#A8B8B8' } },
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Best-effort semantic mapping from a free-form category name to one of
 * the canonical hue keys. Mirrors the keyword set used in
 * `pickIconForCategory` so emoji + color stay in sync. Returns null when
 * no keyword match — caller should fall back to a deterministic hash.
 */
function matchHueKeyByName(name: string): CategoryHueKey | null {
  const n = (name ?? '').toLowerCase()
  if (!n.trim()) return null
  if (/super|alma|merc/.test(n)) return 'supermercado'
  if (/restaur|pizza|hambur|comer|cafe|café|bar/.test(n)) return 'restaurante'
  if (/comida|cocina|desayun/.test(n)) return 'comida'
  if (/viaje|avion|avión|hotel|vacac/.test(n)) return 'viajes'
  if (/transporte|sube|combustible|nafta|auto|uber|cabify|taxi/.test(n)) return 'transporte'
  if (/casa|alquil|hogar|expensa/.test(n)) return 'casa'
  if (/suscrip|netflix|spotify|youtube|disney|prime/.test(n)) return 'suscripciones'
  if (/servic|luz|edenor|metrogas|internet|wifi|gas|agua|aysa/.test(n)) return 'servicios'
  if (/farm|medic|salud|consulta|obra social|prepaga/.test(n)) return 'salud'
  if (/belleza|peluqu|cosmet|maquillaje|uñas/.test(n)) return 'belleza'
  if (/deporte|gym|entren|futbol|tenis|running/.test(n)) return 'deporte'
  if (/ocio|salid|cine|teatro|recital|fernet/.test(n)) return 'ocio'
  if (/educ|curso|libro|colegio|universidad/.test(n)) return 'educacion'
  if (/tec|celular|compu|gadget|software|app/.test(n)) return 'tecnologia'
  if (/mascota|veter|perro|gato|alimento balanc/.test(n)) return 'mascotas'
  if (/ropa|vesti|calzado|zapat|indument/.test(n)) return 'ropa'
  if (/regalo|cumpleaños|aguinaldo/.test(n)) return 'regalos'
  if (/inversi|plazo fijo|bono|accion|acción|cripto|cedear/.test(n)) return 'inversiones'
  if (/impuesto|afip|arba|monotrib|tasa/.test(n)) return 'servicios'
  if (/cuid|personal|higi/.test(n)) return 'belleza'
  if (/otros?/.test(n)) return 'otros'
  return null
}

export function resolveCategoryHue(categoryKeyOrId: string): CategoryHue {
  if ((CATEGORY_HUE_KEYS as readonly string[]).includes(categoryKeyOrId)) {
    return categoryHues[categoryKeyOrId as CategoryHueKey]
  }
  const semantic = matchHueKeyByName(categoryKeyOrId)
  if (semantic) {
    return categoryHues[semantic]
  }
  const index = hashString(categoryKeyOrId) % CATEGORY_HUE_KEYS.length
  return categoryHues[CATEGORY_HUE_KEYS[index]]
}

/**
 * Resolves a category hue from a free-form category NAME. Always tries
 * semantic keyword matching first; falls back to a deterministic hash on
 * the name when no keyword applies. Use this from surfaces that have
 * the human-readable name available (picker rails, list rows) so each
 * category gets a meaningful, distinct color.
 */
export function resolveCategoryHueByName(name: string): CategoryHue {
  const semantic = matchHueKeyByName(name)
  if (semantic) {
    return categoryHues[semantic]
  }
  const index = hashString(name) % CATEGORY_HUE_KEYS.length
  return categoryHues[CATEGORY_HUE_KEYS[index]]
}
