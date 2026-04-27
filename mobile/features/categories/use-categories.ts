import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { supabase } from '@/lib/supabase'

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
  family_id: string
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
  family_id: string
  name: string
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
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      let query = supabase
        .from('categories')
        .select('id, family_id, name, color, template_id, scope, created_at')
        .eq('family_id', familyId)
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
          }))
        }

        throw error
      }

      return ((data as RawCategory[] | null) ?? []).map((category) => ({
        ...category,
        color:
          typeof category.color === 'string' && category.color.trim() !== ''
            ? category.color
            : fallbackCategoryColor(category.id),
        scope: normalizeScope(category.scope),
      }))
    },
  })
}

export function useFixedExpenseCategories(familyId?: string) {
  return useCategories(familyId, 'fixed_expense')
}

export function useCreateCategory(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rawName: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para crear una categoría.')
      }

      const name = rawName.trim()
      if (!name) {
        throw new Error('El nombre de la categoría no puede estar vacío.')
      }

      const { error } = await supabase.from('categories').insert({
        family_id: familyId,
        name,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.family(familyId) }),
      ])
    },
  })
}

interface RenameCategoryInput {
  categoryId: string
  name: string
}

export function useRenameCategory(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ categoryId, name }: RenameCategoryInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para renombrar una categoría.')
      }

      const normalizedName = name.trim()
      if (!normalizedName) {
        throw new Error('El nombre de la categoría no puede estar vacío.')
      }

      const { error } = await supabase
        .from('categories')
        .update({ name: normalizedName })
        .eq('id', categoryId)
        .eq('family_id', familyId)

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey(familyId) })
    },
  })
}

export function useDeleteCategory(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (categoryId: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar una categoría.')
      }

      const countResponse = await supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('category_id', categoryId)

      if (countResponse.error) {
        throw countResponse.error
      }

      if ((countResponse.count ?? 0) > 0) {
        throw new Error('No podés borrar una categoría que ya tiene gastos cargados.')
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .eq('family_id', familyId)

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.family(familyId) }),
      ])
    },
  })
}
