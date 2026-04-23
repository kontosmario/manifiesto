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
const OPTIONAL_CATEGORY_COLUMNS = ['color', 'template_id'] as const

interface RawCategory {
  id: string
  family_id: string
  name: string
  color?: string | null
  template_id?: string | null
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
  created_at: string
}

export const categoriesQueryKey = (familyId?: string) => ['categories', familyId] as const

export function useCategories(familyId?: string) {
  return useQuery<Category[]>({
    queryKey: categoriesQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      const { data, error } = await supabase
        .from('categories')
        .select('id, family_id, name, color, template_id, created_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })

      if (error) {
        if (isMissingOptionalCategoryColumnError(error)) {
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
      }))
    },
  })
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
