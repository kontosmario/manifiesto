import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFamilyBudgetData } from '@/features/family/family-query-invalidation'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import {
  createFixedExpense,
  deleteFixedExpense,
  fetchFixedExpenses,
  recordFixedExpensePayment,
  updateFixedExpense,
  updateFixedExpenseStatus,
  type UpdateFixedExpenseInput,
  type UpsertFixedExpenseInput,
} from '@/features/fixed-expenses/fixed-expense-repository'
import { sendFamilyPush } from '@/lib/send-family-push'
import {
  type FixedExpense,
  type FixedExpenseStatus,
} from './fixed-expense-types'

export type {
  UpdateFixedExpenseInput,
  UpsertFixedExpenseInput,
} from '@/features/fixed-expenses/fixed-expense-repository'

export const fixedExpensesQueryKey = fixedExpenseQueryKeys.family

export function useFixedExpenses(familyId?: string) {
  return useQuery<FixedExpense[]>({
    queryKey: fixedExpensesQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return []
      }
      return fetchFixedExpenses(familyId)
    },
  })
}

export function useCreateFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertFixedExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para crear un gasto fijo.')
      }
      await createFixedExpense(familyId, input)
    },
    onSuccess: async (_data, variables) => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
        includeNotifications: true,
      })

      if (familyId) {
        const pushBody = `${variables.name.trim()} · $${variables.amount}`
        void sendFamilyPush({
          familyId,
          title: 'Nuevo gasto fijo',
          body: pushBody,
          kind: 'fixed_expense',
          url: '/fixed-expenses',
        }).catch(() => {})
      }
    },
  })
}

export function useUpdateFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateFixedExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar un gasto fijo.')
      }
      await updateFixedExpense(familyId, input)
    },
    onSuccess: async (_data, variables) => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
        includeNotifications: true,
      })

      if (familyId) {
        const pushBody = `${variables.name.trim()} · $${variables.amount}`
        void sendFamilyPush({
          familyId,
          title: 'Gasto fijo actualizado',
          body: pushBody,
          kind: 'fixed_expense',
          url: '/fixed-expenses',
        }).catch(() => {})
      }
    },
  })
}

export function useUpdateFixedExpenseStatus(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fixedExpenseId,
      status,
    }: {
      fixedExpenseId: string
      status: FixedExpenseStatus
    }) => {
      if (!familyId) {
        throw new Error('No hay familia activa para actualizar el gasto fijo.')
      }
      await updateFixedExpenseStatus(familyId, fixedExpenseId, status)
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
      })
    },
  })
}

export function useRecordFixedExpensePayment(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fixedExpenseId: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para registrar el pago.')
      }
      await recordFixedExpensePayment(fixedExpenseId)
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
        includeNotifications: true,
      })
    },
  })
}

export function useDeleteFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fixedExpenseId: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar un gasto fijo.')
      }
      await deleteFixedExpense(familyId, fixedExpenseId)
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
        includeNotifications: true,
      })

      if (familyId) {
        void sendFamilyPush({
          familyId,
          title: 'Gasto fijo eliminado',
          body: 'Se eliminó un gasto fijo.',
          kind: 'fixed_expense',
          url: '/fixed-expenses',
        }).catch(() => {})
      }
    },
  })
}
