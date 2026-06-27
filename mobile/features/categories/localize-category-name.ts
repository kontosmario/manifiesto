import i18n from '@/lib/i18n'
import type { CategoryScope } from './use-categories'

/**
 * Localized display for category names — NON-DESTRUCTIVE.
 *
 * Categorías son datos del usuario (tabla `categories`, sembradas en
 * `bootstrap_family` desde `category_templates`). El `name` guardado NO
 * se muta: es load-bearing para el matching de rename (si el usuario
 * renombra, el `name` deja de coincidir con el del template y mostramos
 * lo que el usuario eligió tal cual).
 *
 * Estrategia: cada categoría sembrada arrastra `template_id`. Si el
 * `name` actual sigue coincidiendo con el `name` default de su template
 * (es decir, NO la renombró el usuario), mostramos el nombre localizado
 * vía `t('gastos:categoryTemplates.<scope>.<key>.name')`. Si lo renombró
 * (o no hay template), devolvemos el `name` crudo.
 *
 * El "key" estable es el `name` ES default del template, slugificado. Los
 * names default de ES viven como source-of-truth en
 * `gastos:categoryTemplates.<scope>.<key>.default` para poder detectar el
 * match sin depender del idioma activo (si el device está en EN, el
 * `t(... .name)` ya devuelve inglés y no podríamos comparar contra el
 * `name` ES guardado).
 */

export type LocalizableCategory = {
  name: string
  template_id?: string | null
  scope?: CategoryScope | string | null
}

function normalizeScope(raw: CategoryScope | string | null | undefined): CategoryScope {
  return raw === 'fixed_expense' ? 'fixed_expense' : 'expense'
}

/**
 * Slug estable e idempotente para el name default ES de un template.
 * Quita acentos y no-alfanuméricos para que "Educación" → "educacion".
 * Debe coincidir con las keys agregadas en `gastos:categoryTemplates`.
 */
export function categoryTemplateKey(defaultEsName: string): string {
  return defaultEsName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Devuelve el nombre a MOSTRAR para una categoría. Nunca muta datos.
 *
 * - Sin `template_id` → name crudo (categoría custom del usuario).
 * - Con `template_id` pero `name` ≠ default ES del template → renombrada
 *   por el usuario → name crudo.
 * - Con `template_id` y `name` === default ES → localizado.
 */
export function localizeCategoryName(category: LocalizableCategory): string {
  const rawName = category.name
  // Si tenemos `template_id` y viene null/undefined sabemos con certeza
  // que es una categoría custom (no sembrada) → name crudo. Cuando el
  // campo `template_id` directamente no está presente en el objeto
  // (mapas livianos sin la columna, p.ej. los del RPC
  // `gastos_categories_with_counts`) caemos al matching name+scope, que
  // es el mismo gate real (name === default ES del template).
  if ('template_id' in category && !category.template_id) return rawName

  return localizeCategoryNameByName(rawName, category.scope)
}

/**
 * Resolver localizado SOLO por (name, scope) — para mapas de display que
 * no arrastran `template_id` (p.ej. los construidos desde el RPC
 * `gastos_categories_with_counts`, que devuelve únicamente
 * id/name/color/count). El gate es idéntico: si el `name` guardado
 * coincide con el default ES de algún template de ese scope, se traduce;
 * si no, se devuelve crudo.
 *
 * LÍMITE conocido: una categoría CUSTOM del usuario nombrada
 * exactamente igual que un default ES (ej. crea "Mercado" a mano) se
 * mostraría traducida. Es cosmético y NO destructivo (la data guardada
 * no se toca). Las superficies con acceso al `Category` completo usan
 * `localizeCategoryName`, que sí discrimina por `template_id`.
 */
export function localizeCategoryNameByName(
  rawName: string,
  scope: CategoryScope | string | null | undefined,
): string {
  const normalizedScope = normalizeScope(scope)
  const key = categoryTemplateKey(rawName)
  const base = `gastos:categoryTemplates.${normalizedScope}.${key}`
  const defaultEs = i18n.t(`${base}.default`, { defaultValue: '' })

  if (!defaultEs || defaultEs !== rawName) return rawName

  const localized = i18n.t(`${base}.name`, { defaultValue: '' })
  return localized || rawName
}

/**
 * Localiza la lista de quick_descriptions de un template. Estas NO son
 * datos del usuario (viven en `category_templates`), así que siempre se
 * pueden localizar por índice posicional. Si falta la key traducida,
 * cae al valor crudo provisto.
 */
export function localizeQuickDescriptions(
  scope: CategoryScope | string | null | undefined,
  defaultEsName: string,
  rawDescriptions: string[],
): string[] {
  const normalizedScope = normalizeScope(scope)
  const key = categoryTemplateKey(defaultEsName)
  const base = `gastos:categoryTemplates.${normalizedScope}.${key}.quickDescriptions`
  return rawDescriptions.map((raw, index) => {
    const localized = i18n.t(`${base}.${index}`, { defaultValue: '' })
    return localized || raw
  })
}

/**
 * Adjunta el `displayName` localizado a categorías crudas que vienen SIN
 * él. `displayName` se deriva en el cliente (i18n) — el servidor no puede
 * computarlo. Por eso TODO seed del cache `categoriesQueryKey` vía
 * `setQueryData` (p.ej. el payload de `home_snapshot`) DEBE pasar por
 * acá: si no, el cache se reseedea sin `displayName` y los nombres salen
 * VACÍOS en la UI (el rail/picker rendea `category.displayName`).
 * Espeja la derivación de la queryFn de `useCategories`.
 */
export function withCategoryDisplayNames<
  T extends { name: string; template_id?: string | null },
>(categories: T[], scope: CategoryScope | string): Array<T & { displayName: string }> {
  return categories.map((category) => ({
    ...category,
    displayName: localizeCategoryName({
      name: category.name,
      template_id: category.template_id,
      scope,
    }),
  }))
}
