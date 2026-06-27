import { categoryTemplateKey } from '@/features/categories/localize-category-name'
import type { CategoryIconKey } from './category-icon-registry'
import { CATEGORY_ICONS } from './category-icon-registry'

/**
 * Mapeo SLUG-de-template → ícono (sticker). Se resuelve por el slug ESTABLE de
 * la categoría (`categoryTemplateKey(name crudo)`), NO por el nombre localizado
 * — mismo criterio que el resto de la resolución de categorías (evita el bug de
 * "lógica sobre strings localizados").
 *
 * Batch 1a: las 18 categorías de gasto actuales. Los slugs nuevos (cafetería,
 * delivery, combustible…) y los de fijos/ingresos se suman en próximos batches.
 */
const EXPENSE_ICON_BY_SLUG: Record<string, CategoryIconKey> = {
  alquiler: 'vivienda/vivienda',
  mercado: 'alimentacion/supermercado',
  transporte: 'transporte/transporte-publico',
  ocio: 'entretenimiento/salidas-cine',
  servicios: 'servicios-general/servicios',
  salud: 'salud/medico',
  educacion: 'educacion/educacion',
  mascotas: 'servicios-general/mascotas',
  ropa: 'cuidado-personal/ropa',
  tecnologia: 'tecnologia/celular',
  regalos: 'servicios-general/regalos',
  viajes: 'transporte/avion',
  restaurantes: 'alimentacion/comida-rapida',
  deporte: 'deportes/actividades-fisicas',
  suscripciones: 'extra/subscripciones',
  impuestos: 'finanzas/impuestos',
  belleza: 'cuidado-personal/maquillaje',
  otros: 'servicios-general/otros',
}

const FIXED_ICON_BY_SLUG: Record<string, CategoryIconKey> = {
  servicios: 'vivienda/electricidad',
  vivienda: 'vivienda/vivienda',
  suscripciones: 'extra/subscripciones',
  seguros: 'finanzas/seguros',
  cuotas: 'frecuencias/cuotas',
  impuestos: 'finanzas/impuestos',
  deudas: 'finanzas/deuda',
  inversiones: 'finanzas/inversiones',
}

export type CategoryIconScope = 'expense' | 'fixed_expense'

/**
 * Devuelve la key del ícono sticker para una categoría (por su nombre CRUDO),
 * o null si no hay sticker mapeado (→ el caller cae al emoji). Valida que la key
 * exista en el registry generado.
 */
export function resolveCategoryIconKey(
  rawName: string,
  scope: CategoryIconScope = 'expense',
): CategoryIconKey | null {
  const slug = categoryTemplateKey(rawName)
  const map = scope === 'fixed_expense' ? FIXED_ICON_BY_SLUG : EXPENSE_ICON_BY_SLUG
  const key = map[slug]
  return key && key in CATEGORY_ICONS ? key : null
}
