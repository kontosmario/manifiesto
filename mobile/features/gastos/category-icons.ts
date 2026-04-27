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
