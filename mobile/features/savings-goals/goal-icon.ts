import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'

/**
 * El "emoji" de una meta de ahorro guarda UNO de dos tipos de valor en
 * el mismo campo string (`SavingsGoal.emoji`):
 *   • un emoji literal elegido de la paleta (ej. "🎯", "🏖️")
 *   • la KEY de un sticker del registry de íconos (ej. "metas/playa")
 *
 * El discriminador es simple y no necesita un prefijo extra: si el
 * valor existe como key en `CATEGORY_ICONS` es un sticker; sino es un
 * emoji. Las keys de stickers tienen forma "<scope>/<slug>" — ningún
 * emoji colisiona con ese formato, así que la detección es segura.
 */

/** Stickers sugeridos para metas — fila destacada en el picker. */
export const GOAL_STICKER_KEYS = [
  'metas/objetivo',
  'metas/playa',
  'metas/turismo',
  'metas/terreno',
  'metas/anillo',
] as const

export function isGoalStickerKey(value: string | null | undefined): value is string {
  return value != null && Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, value)
}

/**
 * Glyph para interpolar en strings de copy (CTAs, títulos de sheet,
 * subtítulos). Cuando el valor es un sticker no hay glyph de texto que
 * mostrar — devolvemos '' para que el copy quede limpio (solo el
 * título) en vez de imprimir "metas/playa" como texto crudo.
 */
export function goalEmojiText(value: string | null | undefined): string {
  if (!value) return ''
  return isGoalStickerKey(value) ? '' : value
}
