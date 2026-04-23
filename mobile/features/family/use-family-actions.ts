import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoriesQueryKey } from '@/features/categories/use-categories'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { pushSubscriptionQueryKey } from '@/features/push/use-push-notifications'
import { supabase } from '@/lib/supabase'
import { generateFamilyCode } from '@/utils/generate-family-code'
import { familyQueryKey } from '@/features/family/use-family'

interface FamilyRpcResult {
  family_id: string
  family_code: string
}

function pickRpcResult(data: unknown): FamilyRpcResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No se pudo obtener la familia desde Supabase.')
  }

  return data[0] as FamilyRpcResult
}

export function useBootstrapFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para crear la familia.')
      }

      const { data, error } = await supabase.rpc('bootstrap_family', {
        p_preferred_code: generateFamilyCode(6),
      })

      if (error) {
        throw error
      }

      const result = pickRpcResult(data)
      return result
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
      ])
    },
  })
}

export function useJoinFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rawCode: string) => {
      if (!userId) {
        throw new Error('No hay sesión activa para unirse a la familia.')
      }

      const normalizedCode = rawCode.trim().toUpperCase()
      if (!normalizedCode) {
        throw new Error('Ingresá un código de familia válido.')
      }

      const { data, error } = await supabase.rpc('join_family_by_code', {
        p_code: normalizedCode,
      })

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
      ])
    },
  })
}

export function useLeaveCurrentFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para salir de la familia.')
      }

      const { data, error } = await supabase.rpc('leave_current_family')

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.removeQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.recentFamily(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.total(result.family_id) }),
        queryClient.removeQueries({
          queryKey: expenseQueryKeys.periodTotalFamily(result.family_id),
        }),
        queryClient.removeQueries({
          queryKey: expenseQueryKeys.monthlySpentFamily(result.family_id),
        }),
        queryClient.removeQueries({ queryKey: familyFinanceQueryKey(result.family_id) }),
        queryClient.removeQueries({ queryKey: fixedExpenseQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({ queryKey: notificationQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({
          queryKey: pushSubscriptionQueryKey(result.family_id, userId),
        }),
      ])
    },
  })
}
