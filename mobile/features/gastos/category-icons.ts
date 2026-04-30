/**
 * Canonical emoji for the 7 Fijos categories from the V1 Cuaderno
 * design. Match is case-insensitive on the exact category name.
 */
export function pickIconForFixedExpenseCategory(name: string): string {
  const n = (name ?? '').trim().toLowerCase()
  switch (n) {
    case 'servicios':
      return '⚡'
    case 'vivienda':
      return '🏠'
    case 'suscripciones':
      return '🎬'
    case 'seguros':
      return '🛡️'
    case 'cuotas':
      return '💳'
    case 'impuestos':
      return '📄'
    case 'deudas':
      return '⚠️'
    case 'inversiones':
      return '📈'
    default:
      return '📁'
  }
}

/**
 * Resolves a reasonable emoji icon from a category name. Used across
 * Home activity rows and Gastos filter pills / movement rows until the
 * schema exposes a per-category emoji column.
 */
export function pickIconForCategory(name: string): string {
  const n = (name ?? '').toLowerCase()
  if (/super|alma|merc|comida/.test(n)) return '🛒'
  if (/transporte|sube|combustible|auto|uber/.test(n)) return '🚌'
  if (/ocio|salid|fernet|bar|cafe|café/.test(n)) return '🎬'
  if (/casa|alquil|hogar/.test(n)) return '🏠'
  if (/servic|luz|edenor|metrogas|internet|wifi/.test(n)) return '💡'
  if (/salud|farm|medic/.test(n)) return '💊'
  if (/educ|curso|libro/.test(n)) return '📚'
  if (/mascota|veter|perro|gato/.test(n)) return '🐾'
  if (/ropa|vesti|calzado|zapat/.test(n)) return '👕'
  if (/tec|celular|compu|gadget/.test(n)) return '💻'
  if (/regalo/.test(n)) return '🎁'
  if (/viaje|avion|hotel/.test(n)) return '✈️'
  if (/restaur|pizza|hambur|comer/.test(n)) return '🍽️'
  if (/deporte|gym|entren/.test(n)) return '⚽'
  if (/suscrip|netflix|spotify|youtube/.test(n)) return '📱'
  if (/impuesto|afip|arba/.test(n)) return '📄'
  if (/belleza|peluqu|cosmet/.test(n)) return '💄'
  if (/cuid|personal|higi/.test(n)) return '🧴'
  if (/otros?/.test(n)) return '📦'
  return '📦'
}

/**
 * Vector-icon variant of `pickIconForCategory` — returns a MaterialIcons
 * glyph name for surfaces that need a tokenizable, theme-aware icon
 * instead of an emoji (e.g. the MonthSummary band, where the icon sits
 * on a tinted circle and inherits text color tokens).
 *
 * Mirrors the same regex matchers as the emoji variant so both stay in
 * sync — adding a new category should update both.
 */
export function pickMaterialIconForCategory(
  name: string,
): 'shopping-cart' | 'directions-bus' | 'theaters' | 'home' | 'bolt'
  | 'medical-services' | 'school' | 'pets' | 'checkroom' | 'devices'
  | 'redeem' | 'flight' | 'restaurant' | 'sports-soccer' | 'subscriptions'
  | 'description' | 'face' | 'spa' | 'category' {
  const n = (name ?? '').toLowerCase()
  if (/super|alma|merc|comida/.test(n)) return 'shopping-cart'
  if (/transporte|sube|combustible|auto|uber/.test(n)) return 'directions-bus'
  if (/ocio|salid|fernet|bar|cafe|café/.test(n)) return 'theaters'
  if (/casa|alquil|hogar/.test(n)) return 'home'
  if (/servic|luz|edenor|metrogas|internet|wifi/.test(n)) return 'bolt'
  if (/salud|farm|medic/.test(n)) return 'medical-services'
  if (/educ|curso|libro/.test(n)) return 'school'
  if (/mascota|veter|perro|gato/.test(n)) return 'pets'
  if (/ropa|vesti|calzado|zapat/.test(n)) return 'checkroom'
  if (/tec|celular|compu|gadget/.test(n)) return 'devices'
  if (/regalo/.test(n)) return 'redeem'
  if (/viaje|avion|hotel/.test(n)) return 'flight'
  if (/restaur|pizza|hambur|comer/.test(n)) return 'restaurant'
  if (/deporte|gym|entren/.test(n)) return 'sports-soccer'
  if (/suscrip|netflix|spotify|youtube/.test(n)) return 'subscriptions'
  if (/impuesto|afip|arba/.test(n)) return 'description'
  if (/belleza|peluqu|cosmet/.test(n)) return 'face'
  if (/cuid|personal|higi/.test(n)) return 'spa'
  return 'category'
}
