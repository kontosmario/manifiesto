import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { sendFamilyPush } from '../lib/sendFamilyPush'
import {
  getCachedProfileDisplayName,
  setCachedProfileDisplayNames,
} from '../lib/profileDisplayNameCache'

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

export const familyTotalQueryKey = (familyId?: string) =>
  ['expenses-total', familyId] as const

export const familyPeriodTotalQueryKey = (
  familyId?: string,
  startIso?: string,
  endIso?: string,
) => ['expenses-period-total', familyId, startIso, endIso] as const

export const familyMonthlySpentQueryKey = (familyId?: string, monthsBack = 6) =>
  ['expenses-monthly-spent', familyId, monthsBack] as const

interface ExpenseMonthRow {
  price: number | string
  created_at: string
}

export interface FamilyMonthlySpent {
  monthStartIso: string
  totalSpent: number
}

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
      creatorIds.forEach((creatorId) => {
        const cachedDisplayName = getCachedProfileDisplayName(creatorId)
        if (cachedDisplayName) {
          displayNameByUserId.set(creatorId, cachedDisplayName)
        }
      })

      const missingCreatorIds = creatorIds.filter(
        (creatorId) => !displayNameByUserId.has(creatorId),
      )

      if (missingCreatorIds.length > 0) {
        const profilesResponse = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', missingCreatorIds)

        if (profilesResponse.error) {
          throw profilesResponse.error
        }

        const loadedProfiles = (profilesResponse.data as ProfileRow[] | null) ?? []
        setCachedProfileDisplayNames(loadedProfiles)

        loadedProfiles.forEach((profile) => {
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

export function useFamilyTotal(familyId?: string) {
  return useQuery<number>({
    queryKey: familyTotalQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return 0
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('price')
        .eq('family_id', familyId)

      if (error) {
        throw error
      }

      return (data ?? []).reduce((sum, row) => sum + Number(row.price ?? 0), 0)
    },
  })
}

export function useFamilyPeriodTotal(familyId?: string, startIso?: string, endIso?: string) {
  return useQuery<number>({
    queryKey: familyPeriodTotalQueryKey(familyId, startIso, endIso),
    enabled: Boolean(familyId && startIso && endIso),
    queryFn: async () => {
      if (!familyId || !startIso || !endIso) {
        return 0
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('price')
        .eq('family_id', familyId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)

      if (error) {
        throw error
      }

      return (data ?? []).reduce((sum, row) => sum + Number(row.price ?? 0), 0)
    },
  })
}

export function useFamilyMonthlySpent(familyId?: string, monthsBack = 6) {
  return useQuery<FamilyMonthlySpent[]>({
    queryKey: familyMonthlySpentQueryKey(familyId, monthsBack),
    enabled: Boolean(familyId) && monthsBack > 0,
    queryFn: async () => {
      if (!familyId || monthsBack <= 0) {
        return []
      }

      const now = new Date()
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const firstMonthStart = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - (monthsBack - 1),
        1,
      )

      const { data, error } = await supabase
        .from('expenses')
        .select('price, created_at')
        .eq('family_id', familyId)
        .gte('created_at', firstMonthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString())

      if (error) {
        throw error
      }

      const totalsByMonth = new Map<string, number>()

      ;((data as ExpenseMonthRow[] | null) ?? []).forEach((row) => {
        const createdAtDate = new Date(row.created_at)
        if (Number.isNaN(createdAtDate.getTime())) {
          return
        }

        const monthStart = new Date(createdAtDate.getFullYear(), createdAtDate.getMonth(), 1)
        const monthKey = monthStart.toISOString()
        const previous = totalsByMonth.get(monthKey) ?? 0
        totalsByMonth.set(monthKey, previous + Number(row.price ?? 0))
      })

      const monthlySeries: FamilyMonthlySpent[] = []
      for (let offset = 0; offset < monthsBack; offset += 1) {
        const monthStart = new Date(
          currentMonthStart.getFullYear(),
          currentMonthStart.getMonth() - offset,
          1,
        )
        const monthStartIso = monthStart.toISOString()

        monthlySeries.push({
          monthStartIso,
          totalSpent: totalsByMonth.get(monthStartIso) ?? 0,
        })
      }

      return monthlySeries
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
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
        queryClient.invalidateQueries({ queryKey: familyTotalQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['expenses-period-total', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['expenses-monthly-spent', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['family-notifications', familyId] }),
      ])

      if (familyId) {
        const pushBody = `${variables.description.trim()} · $${variables.price}`
        void sendFamilyPush({
          familyId,
          title: 'Nuevo gasto cargado',
          body: pushBody,
          kind: 'expense',
          url: '/app',
        })
          .catch(() => {})
      }
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
        queryClient.invalidateQueries({ queryKey: familyTotalQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['expenses-period-total', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['expenses-monthly-spent', familyId] }),
      ])
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
        queryClient.invalidateQueries({ queryKey: familyTotalQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['expenses-period-total', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['expenses-monthly-spent', familyId] }),
      ])
    },
  })
}

export function useClearFamilyExpenses(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!familyId) {
        throw new Error('No hay familia activa para limpiar los gastos.')
      }

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('family_id', familyId)

      if (error) {
        throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses', familyId] }),
        queryClient.invalidateQueries({ queryKey: familyTotalQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['expenses-period-total', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['expenses-monthly-spent', familyId] }),
      ])
    },
  })
}
