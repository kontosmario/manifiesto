import { useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { localizeCategoryName } from './localize-category-name'

const CATEGORY_FALLBACK_COLORS = [
  '#89C8F7',
  '#7EE3D4',
  '#95E38E',
  '#CBEA7A',
  '#F4D87E',
  '#FFBF8A',
  '#FFA3A6',
  '#F6A3D1',
  '#C7AEFF',
  '#AEBBFF',
  '#8FD9E8',
  '#9DE7C8',
] as const

const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])
const OPTIONAL_CATEGORY_COLUMNS = ['color', 'template_id', 'scope'] as const

export type CategoryScope = 'expense' | 'fixed_expense'

interface RawCategory {
  id: string
  // null para las categorías STANDARD (templates globales, expuestos por la
  // view `categories` con family_id NULL). Las custom traen el family_id.
  family_id: string | null
  name: string
  color?: string | null
  template_id?: string | null
  scope?: string | null
  created_at: string
}

function isMissingOptionalCategoryColumnError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_COLUMN_CODES.has(code) &&
    OPTIONAL_CATEGORY_COLUMNS.some((column) => text.includes(column))
  )
}

function fallbackCategoryColor(categoryId: string): string {
  let hash = 0
  for (let index = 0; index < categoryId.length; index += 1) {
    hash = (hash * 31 + categoryId.charCodeAt(index)) | 0
  }

  return CATEGORY_FALLBACK_COLORS[Math.abs(hash) % CATEGORY_FALLBACK_COLORS.length]
}

export interface Category {
  id: string
  /** null para categorías STANDARD (catálogo global); set para las custom. */
  family_id: string | null
  /**
   * Nombre CRUDO guardado en DB. Load-bearing: es la fuente para el
   * matching de rename contra `category_templates`. NO mostrar este
   * campo en UI directamente — usar `displayName`.
   */
  name: string
  /**
   * Nombre A MOSTRAR (localizado). Si la categoría sigue coincidiendo
   * con el name default de su template, viene traducido al idioma
   * activo; si el usuario la renombró (o es custom), == `name` crudo.
   * Derivado en el cliente — NO se persiste.
   */
  displayName: string
  color: string
  template_id?: string | null
  scope: CategoryScope
  created_at: string
}

export const categoriesQueryKey = (familyId?: string, scope?: CategoryScope) =>
  ['categories', familyId, scope ?? 'expense'] as const

function normalizeScope(raw: string | null | undefined): CategoryScope {
  return raw === 'fixed_expense' ? 'fixed_expense' : 'expense'
}

export function useCategories(familyId?: string, scope: CategoryScope = 'expense') {
  return useQuery<Category[]>({
    queryKey: categoriesQueryKey(familyId, scope),
    enabled: Boolean(familyId),
    // Categories rarely change mid-session and mutations invalidate
    // the key explicitly. Override the global 30s staleTime so tab
    // switches don't fire silent refetches.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      // `categories` es una VIEW (templates globales ∪ custom per-familia).
      // Los templates standard vienen con family_id NULL → se incluyen para
      // TODA familia; los custom matchean por family_id.
      const query = supabase
        .from('categories')
        .select('id, family_id, name, color, template_id, scope, created_at')
        .or(`family_id.eq.${familyId},family_id.is.null`)
        .eq('scope', scope)
        .order('created_at', { ascending: true })

      const { data, error } = await query

      if (error) {
        if (isMissingOptionalCategoryColumnError(error)) {
          // Pre-scope schema — only expense-scoped cats exist. Return
          // them when expense scope is requested; return nothing for
          // fixed_expense so callers can fall back gracefully.
          if (scope !== 'expense') {
            return []
          }

          const fallbackResponse = await supabase
            .from('categories')
            .select('id, family_id, name, created_at')
            .eq('family_id', familyId)
            .order('created_at', { ascending: true })

          if (fallbackResponse.error) {
            throw fallbackResponse.error
          }

          return ((fallbackResponse.data as RawCategory[] | null) ?? []).map((category) => ({
            ...category,
            color: fallbackCategoryColor(category.id),
            template_id: null,
            scope: 'expense' as CategoryScope,
            // Pre-scope schema: sin template_id → displayName == name crudo.
            displayName: category.name,
          }))
        }

        throw error
      }

      return ((data as RawCategory[] | null) ?? []).map((category) => {
        const scope = normalizeScope(category.scope)
        return {
          ...category,
          color:
            typeof category.color === 'string' && category.color.trim() !== ''
              ? category.color
              : fallbackCategoryColor(category.id),
          scope,
          // Display localizado NO destructivo: si la categoría sigue
          // matcheando el name default de su template, se traduce; si
          // el usuario la renombró, == name crudo.
          displayName: localizeCategoryName({
            name: category.name,
            template_id: category.template_id,
            scope,
          }),
        }
      })
    },
  })
}

export function useFixedExpenseCategories(familyId?: string) {
  return useCategories(familyId, 'fixed_expense')
}
