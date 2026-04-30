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
    // Optimistic update: drop the row from the local caches before the
    // network round-trip so the swipe-to-delete feels instant. We
    // snapshot the prior state in `onMutate` and restore it `onError`,
    // and only do a surgical (not budget-wide) invalidation on settle —
    // the dependent totals/aggregates are derived client-side from the
    // expense list, so no extra fetch is needed.
    onMutate: async (expenseId: string) => {
      if (!familyId) return { snapshots: [] as Array<readonly [unknown, unknown]> }
      const exactKeys: ReadonlyArray<readonly unknown[]> = [
        expenseQueryKeys.family(familyId),
        expenseQueryKeys.recent(familyId, 6),
        expenseQueryKeys.recent(familyId, 3),
        expenseQueryKeys.recentFamily(familyId),
      ]
      await Promise.all(
        exactKeys.map((k) => queryClient.cancelQueries({ queryKey: k as readonly unknown[] })),
      )
      const snapshots = exactKeys.map(
        (k) => [k, queryClient.getQueryData(k as readonly unknown[])] as const,
      )
      for (const k of exactKeys) {
        queryClient.setQueryData<Expense[] | undefined>(
          k as readonly unknown[],
          (old) => (old ? old.filter((e) => e.id !== expenseId) : old),
        )
      }
      return { snapshots }
    },
    onError: (_err, _expenseId, ctx) => {
      const snapshots = ctx?.snapshots ?? []
      for (const [k, data] of snapshots) {
        queryClient.setQueryData(k as readonly unknown[], data)
      }
    },
    onSettled: () => {
      if (!familyId) return
      // Surgical invalidation: only the rows that actually changed.
      // Totals/aggregates derive from the expense list and recompute
      // automatically from the updated cache.
      queryClient.invalidateQueries({ queryKey: expenseQueryKeys.family(familyId) })
      queryClient.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(familyId) })
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
