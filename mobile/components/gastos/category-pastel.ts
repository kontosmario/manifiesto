/**
 * Puente categoría → pastel del rediseño.
 *
 * El catálogo no expone un slug que mapee 1:1 contra las 12 claves de
 * `neoCategoryPastels` (son grupos de ícono: `alimentacion/…`, `finanzas/…`),
 * así que el puente es un hash estable del nombre CRUDO: la misma categoría
 * cae siempre en el mismo pastel y `category.color` —los saturados del
 * catálogo V1, que el owner rechaza fuera del sistema— deja de pintarse.
 *
 * Vive acá y no en `theme/neo-tokens` porque depende del catálogo de
 * categorías, no del tema: los tokens siguen siendo la fuente de los hues.
 */
import { neoCategoryPastels, pastelDarkSolid } from '@/theme/neo-tokens'

const PASTELS = Object.values(neoCategoryPastels)

export function categoryPastel(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return PASTELS[Math.abs(hash) % PASTELS.length]
}

/**
 * El mismo pastel ya resuelto para el tema. En oscuro el pastel claro al 13%
 * se lava a un tinte casi monocromo (todos los swatches terminan iguales):
 * `pastelDarkSolid` conserva el matiz y baja la luminosidad.
 */
export function categorySwatch(seed: string, isDark: boolean): string {
  const pastel = categoryPastel(seed)
  return isDark ? pastelDarkSolid(pastel) : pastel
}
