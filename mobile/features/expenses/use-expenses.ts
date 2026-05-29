import { useEffect, useRef } from 'react'
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
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { sendFamilyPush } from '@/lib/send-family-push'
import { toast } from '@/lib/toast-bus'

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

// ── Helpers para optimistic updates ──────────────────────────────────

interface ExpenseListSnapshot {
  list: Expense[] | undefined
  recent6: Expense[] | undefined
  recent3: Expense[] | undefined
}

function snapshotExpenseLists(
  qc: ReturnType<typeof useQueryClient>,
  familyId: string,
): ExpenseListSnapshot {
  return {
    list: qc.getQueryData<Expense[]>(expenseQueryKeys.list(familyId, undefined)),
    recent6: qc.getQueryData<Expense[]>(expenseQueryKeys.recent(familyId, 6)),
    recent3: qc.getQueryData<Expense[]>(expenseQueryKeys.recent(familyId, 3)),
  }
}

function restoreExpenseLists(
  qc: ReturnType<typeof useQueryClient>,
  familyId: string,
  snap: ExpenseListSnapshot,
): void {
  qc.setQueryData(expenseQueryKeys.list(familyId, undefined), snap.list)
  qc.setQueryData(expenseQueryKeys.recent(familyId, 6), snap.recent6)
  qc.setQueryData(expenseQueryKeys.recent(familyId, 3), snap.recent3)
}

function makeTentativeId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCreateExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{
    mutate: (input: CreateExpenseInput) => void
  } | null>(null)

  const result = useMutation<void, Error, CreateExpenseInput, { previous: ExpenseListSnapshot } | undefined>({
    mutationFn: async ({
      categoryId,
      commitmentId,
      createdAt,
      description,
      notes,
      price,
    }) => {
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
    onMutate: async (input) => {
      if (!familyId || !userId) return undefined
      await queryClient.cancelQueries({
        queryKey: expenseQueryKeys.family(familyId),
      })
      const previous = snapshotExpenseLists(queryClient, familyId)

      // Construimos un Expense optimista. `creator_display_name` queda
      // vacío — el ActivityRowV2 de Home resuelve el nombre por
      // `created_by` contra family_members, no por este campo, así que
      // no se ve raro. Al settle, el refetch trae el row real.
      const optimistic: Expense = {
        id: makeTentativeId(),
        family_id: familyId,
        category_id: input.categoryId,
        commitment_id: input.commitmentId ?? null,
        description: input.description,
        notes: input.notes ?? null,
        price: input.price,
        created_by: userId,
        creator_display_name: '',
        created_at: input.createdAt ?? new Date().toISOString(),
      }

      const prepend = (arr: Expense[] | undefined) =>
        arr ? [optimistic, ...arr] : [optimistic]

      queryClient.setQueryData<Expense[] | undefined>(
        expenseQueryKeys.list(familyId, undefined),
        prepend,
      )
      // El recent feed pre-filtra commitment_id, no insertamos un fijo
      // auto-pagado ahí (mantiene la coherencia con el pre-filter del
      // home_snapshot seed).
      if (!optimistic.commitment_id) {
        queryClient.setQueryData<Expense[] | undefined>(
          expenseQueryKeys.recent(familyId, 6),
          prepend,
        )
        queryClient.setQueryData<Expense[] | undefined>(
          expenseQueryKeys.recent(familyId, 3),
          prepend,
        )
      }

      return { previous }
    },
    onSuccess: (_data, variables) => {
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
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous) {
        restoreExpenseLists(queryClient, familyId, ctx.previous)
      }
      toast.error('No se pudo guardar el gasto.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['expenses'],
      })
    },
  })

  // Capture mutate so the retry toast action keeps a stable handle.
  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useUpdateExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{
    mutate: (input: UpdateExpenseInput) => void
  } | null>(null)

  const result = useMutation<void, Error, UpdateExpenseInput, { previous: ExpenseListSnapshot } | undefined>({
    mutationFn: async ({ expenseId, description, notes, price }) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar gastos.')
      }
      await updateExpense(familyId, { description, notes, expenseId, price })
    },
    onMutate: async ({ expenseId, description, notes, price }) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: expenseQueryKeys.family(familyId),
      })
      const previous = snapshotExpenseLists(queryClient, familyId)

      const patch = (arr: Expense[] | undefined) =>
        arr?.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                description,
                notes: notes ?? null,
                price,
              }
            : e,
        )

      queryClient.setQueryData<Expense[] | undefined>(
        expenseQueryKeys.list(familyId, undefined),
        patch,
      )
      queryClient.setQueryData<Expense[] | undefined>(
        expenseQueryKeys.recent(familyId, 6),
        patch,
      )
      queryClient.setQueryData<Expense[] | undefined>(
        expenseQueryKeys.recent(familyId, 3),
        patch,
      )

      return { previous }
    },
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous) {
        restoreExpenseLists(queryClient, familyId, ctx.previous)
      }
      toast.error('No se pudo actualizar el gasto.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['expenses'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useDeleteExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: string) => void } | null>(null)

  const result = useMutation<
    void,
    Error,
    string,
    { snapshots: ReadonlyArray<readonly [readonly unknown[], unknown]> } | undefined
  >({
    mutationFn: async (expenseId) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar gastos.')
      }
      await deleteExpense(familyId, expenseId)
    },
    onMutate: async (expenseId) => {
      if (!familyId) return undefined
      const exactKeys: ReadonlyArray<readonly unknown[]> = [
        expenseQueryKeys.family(familyId),
        expenseQueryKeys.recent(familyId, 6),
        expenseQueryKeys.recent(familyId, 3),
        expenseQueryKeys.recentFamily(familyId),
      ]
      await Promise.all(
        exactKeys.map((k) =>
          queryClient.cancelQueries({ queryKey: k }),
        ),
      )
      const snapshots = exactKeys.map(
        (k) => [k, queryClient.getQueryData(k)] as const,
      )
      for (const k of exactKeys) {
        queryClient.setQueryData<Expense[] | undefined>(k, (old) =>
          old ? old.filter((e) => e.id !== expenseId) : old,
        )
      }
      return { snapshots }
    },
    onError: (_err, expenseId, ctx) => {
      const snapshots = ctx?.snapshots ?? []
      for (const [k, data] of snapshots) {
        queryClient.setQueryData(k, data)
      }
      toast.error('No se pudo borrar el gasto.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(expenseId),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['expenses'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}
