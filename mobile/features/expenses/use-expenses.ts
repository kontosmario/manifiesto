import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import {
  clearFamilyExpenses,
  createExpense,
  deleteExpense,
  fetchFamilyMonthlySpent,
  fetchFamilyPeriodTotal,
  fetchFamilyTotal,
  loadExpenses,
  updateExpense,
  type CreateExpenseInput,
  type Expense,
  type FamilyMonthlySpent,
  type UpdateExpenseInput,
} from '@/features/expenses/expense-repository'
import { invalidateFamilyBudgetData } from '@/features/family/family-query-invalidation'
import { sendFamilyPush } from '@/lib/send-family-push'

export type {
  CreateExpenseInput,
  Expense,
  FamilyMonthlySpent,
  UpdateExpenseInput,
} from '@/features/expenses/expense-repository'

export const expensesQueryKey = expenseQueryKeys.list
export const familyTotalQueryKey = expenseQueryKeys.total
export const familyPeriodTotalQueryKey = expenseQueryKeys.periodTotal
export const familyMonthlySpentQueryKey = expenseQueryKeys.monthlySpent
export const recentExpensesQueryKey = expenseQueryKeys.recent

export function useExpenses(familyId?: string, categoryId?: string) {
  return useQuery<Expense[]>({
    queryKey: expensesQueryKey(familyId, categoryId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      return loadExpenses(familyId, { categoryId })
    },
  })
}

export function useRecentExpenses(familyId?: string, limit = 3) {
  return useQuery<Expense[]>({
    queryKey: recentExpensesQueryKey(familyId, limit),
    enabled: Boolean(familyId) && limit > 0,
    queryFn: async () => {
      if (!familyId || limit <= 0) {
        return []
      }

      return loadExpenses(familyId, { limit })
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

      return fetchFamilyTotal(familyId)
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

      return fetchFamilyPeriodTotal(familyId, startIso, endIso)
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

      return fetchFamilyMonthlySpent(familyId, monthsBack)
    },
  })
}

export function useCreateExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      categoryId,
      commitmentId,
      createdAt,
      description,
      price,
    }: CreateExpenseInput) => {
      if (!familyId || !userId) {
        throw new Error('No hay sesión o familia activa para crear gastos.')
      }
      await createExpense(familyId, userId, {
        categoryId,
        commitmentId,
        createdAt,
        description,
        price,
      })
    },
    onSuccess: async (_data, variables) => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
        includeNotifications: true,
      })

      if (familyId) {
        const pushBody = `${variables.description.trim()} · $${variables.price}`
        void sendFamilyPush({
          familyId,
          title: 'Nuevo gasto cargado',
          body: pushBody,
          kind: 'expense',
          url: '/home',
        }).catch(() => {})
      }
    },
  })
}

export function useUpdateExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ expenseId, description, price }: UpdateExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar gastos.')
      }
      await updateExpense(familyId, { description, expenseId, price })
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
      })
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
      await deleteExpense(familyId, expenseId)
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId, {
        includeFixedExpenses: true,
      })
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
      await clearFamilyExpenses(familyId)
    },
    onSuccess: async () => {
      await invalidateFamilyBudgetData(queryClient, familyId)
    },
  })
}
