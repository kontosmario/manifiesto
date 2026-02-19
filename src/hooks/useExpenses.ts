import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

interface RawExpense {
  id: string
  family_id: string
  category_id: string
  description: string
  price: number | string
  created_by: string
  created_at: string
}

interface ProfileRow {
  id: string
  display_name: string
}

export interface Expense {
  id: string
  family_id: string
  category_id: string
  description: string
  price: number
  created_by: string
  created_at: string
  creator_display_name: string
}

export const expensesQueryKey = (familyId?: string, categoryId?: string) =>
  ['expenses', familyId, categoryId] as const

export function useExpenses(familyId?: string, categoryId?: string) {
  return useQuery<Expense[]>({
    queryKey: expensesQueryKey(familyId, categoryId),
    enabled: Boolean(familyId && categoryId),
    queryFn: async () => {
      if (!familyId || !categoryId) {
        return []
      }

      const expensesResponse = await supabase
        .from('expenses')
        .select('id, family_id, category_id, description, price, created_by, created_at')
        .eq('family_id', familyId)
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })

      if (expensesResponse.error) {
        throw expensesResponse.error
      }

      const rows = (expensesResponse.data ?? []) as RawExpense[]
      const creatorIds = [...new Set(rows.map((row) => row.created_by))]

      const displayNameByUserId = new Map<string, string>()
      if (creatorIds.length > 0) {
        const profilesResponse = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', creatorIds)

        if (profilesResponse.error) {
          throw profilesResponse.error
        }

        ;(profilesResponse.data as ProfileRow[] | null)?.forEach((profile) => {
          displayNameByUserId.set(profile.id, profile.display_name)
        })
      }

      return rows.map((row) => ({
        ...row,
        price: Number(row.price),
        creator_display_name: displayNameByUserId.get(row.created_by) ?? 'Sin nombre',
      }))
    },
  })
}

interface CreateExpenseInput {
  categoryId: string
  description: string
  price: number
}

export function useCreateExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ categoryId, description, price }: CreateExpenseInput) => {
      if (!familyId || !userId) {
        throw new Error('No hay sesión o familia activa para crear gastos.')
      }

      const normalizedDescription = description.trim()
      if (!normalizedDescription) {
        throw new Error('La descripción es obligatoria.')
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error('El precio debe ser un número mayor o igual a 0.')
      }

      const { error } = await supabase.from('expenses').insert({
        family_id: familyId,
        category_id: categoryId,
        description: normalizedDescription,
        price,
        created_by: userId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses', familyId] })
    },
  })
}

interface UpdateExpenseInput {
  expenseId: string
  description: string
  price: number
}

export function useUpdateExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ expenseId, description, price }: UpdateExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar gastos.')
      }

      const normalizedDescription = description.trim()
      if (!normalizedDescription) {
        throw new Error('La descripción es obligatoria.')
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error('El precio debe ser un número mayor o igual a 0.')
      }

      const { error } = await supabase
        .from('expenses')
        .update({
          description: normalizedDescription,
          price,
        })
        .eq('id', expenseId)
        .eq('family_id', familyId)

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses', familyId] })
    },
  })
}

export function useDeleteExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (expenseId: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar gastos.')
      }

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('family_id', familyId)

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses', familyId] })
    },
  })
}
