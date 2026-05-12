import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import {
  createExpense,
  deleteExpense,
  loadExpenses,
  updateExpense,
  type CreateExpenseInput,
  type Expense,
  type UpdateExpenseInput,
} from '@/features/expenses/expense-repository'
import { invalidateFamilyBudgetData } from '@/features/family/family-query-invalidation'
import { sendFamilyPush } from '@/lib/send-family-push'

export type {
  CreateExpenseInput,
  Expense,
  UpdateExpenseInput,
} from '@/features/expenses/expense-repository'

export const expensesQueryKey = expenseQueryKeys.list
export const recentExpensesQueryKey = expenseQueryKeys.recent

export function useExpenses(familyId?: string, categoryId?: string) {
  return useQuery<Expense[]>({
    queryKey: expensesQueryKey(familyId, categoryId),
    enabled: Boolean(familyId),
    // Expenses change via mutations (create/update/delete) y realtime
    // (`useGastosRealtime`), ambos invalidan este key. Por eso podemos
    // mantener un staleTime largo (5 min) — los cambios reales están
    // cubiertos sin necesidad de refetch periódico.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      return loadExpenses(familyId, { categoryId })
    },
  })
}

/**
 * Recent expenses para el activity feed de Home — filtra rows con
 * `commitment_id` (fijos auto-pagados) que viven exclusivamente en la
 * vista de Fijos.
 *
 * Implementación: over-fetch `limit * 4` rows desde DB para tener buffer
 * cuando una cascada de fijos pagados ocupa los slots top, y filtra +
 * slice client-side. La cache key sigue siendo `(familyId, limit)` para
 * mantenerla coherente con el seed en `use-home-snapshot.ts` (que
 * pre-filtra antes de slicear el slice de 120 que trae el RPC).
 *
 * Por qué over-fetch en vez de filter DB-level: el filter `is(commitment_id, null)`
 * está disponible vía PostgREST, pero agregarlo al `applyExpenseFilters`
 * acarrearía soporte de la column legacy (pre-2026-05) que algunos envs
 * todavía no tienen. Over-fetch evita el branching y aún así es barato
 * (24 rows vs 6). Si en el futuro la column es universal, swap a filter SQL.
 */
export function useRecentExpenses(familyId?: string, limit = 3) {
  return useQuery<Expense[]>({
    queryKey: recentExpensesQueryKey(familyId, limit),
    enabled: Boolean(familyId) && limit > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId || limit <= 0) {
        return []
      }

      const buffer = Math.max(limit * 4, 12)
      const rows = await loadExpenses(familyId, { limit: buffer })
      return rows.filter((e) => !e.commitment_id).slice(0, limit)
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
      notes,
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
        notes,
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
    mutationFn: async ({ expenseId, description, notes, price }: UpdateExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar gastos.')
      }
      await updateExpense(familyId, { description, notes, expenseId, price })
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
