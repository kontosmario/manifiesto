import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export interface Category {
  id: string
  family_id: string
  name: string
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
        .select('id, family_id, name, created_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      return data ?? []
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
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
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
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
      ])
    },
  })
}
