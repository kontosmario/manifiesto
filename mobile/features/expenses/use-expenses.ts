import { useEffect, useRef } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import {
  createExpense,
  deleteExpense,
  loadCommitmentExpenses,
  loadExpenses,
  updateExpense,
  type CreateExpenseInput,
  type Expense,
  type UpdateExpenseInput,
} from '@/features/expenses/expense-repository'
import { gastosEndpointKeys } from '@/features/gastos/use-gastos-endpoints'
import type {
  GastosExpenseRow,
  GastosExpensesPage,
} from '@/features/gastos/gastos-endpoints.types'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { sendFamilyPush } from '@/lib/send-family-push'
import { toast } from '@/lib/toast-bus'
import i18n from '@/lib/i18n'

export type {
  CreateExpenseInput,
  Expense,
  UpdateExpenseInput,
} from '@/features/expenses/expense-repository'

export const expensesQueryKey = expenseQueryKeys.list
export const recentExpensesQueryKey = expenseQueryKeys.recent
export const commitmentExpenseHistoryKey = expenseQueryKeys.commitmentHistory

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
 * Histórico de pagos de fijos — todos los expenses con `commitment_id`
 * no-null, sin pasar por el cap del `home_snapshot` (120 filas) que
 * cortaba pagos viejos cuando había mucho volumen de gasto variable en
 * el medio.
 *
 * Por qué un query dedicado en lugar de levantar el cap del snapshot:
 * el snapshot debe seguir siendo liviano (cold start de Home), y los
 * pagos de fijos crecen ~linealmente con el tiempo (no con el volumen
 * de gastos variables). Una familia con 10 fijos activos x 12 meses
 * acumula ~120 rows — el dataset es bounded y barato de fetchear.
 *
 * Consumido por `useFijosController` para que `summarizeFijos` pueda
 * comparar el pago actual de cada fijo contra el penúltimo registrado
 * (necesario para el badge de variación de precio, ej. "Seguro auto
 * −56% vs mes pasado"). Sin esto, el badge desaparecía silenciosamente
 * cuando el cap dejaba afuera el pago anterior.
 *
 * Cache key bajo el prefijo `expenseQueryKeys.family(familyId)`, así
 * `syncAllAfterMutation({ scopes: ['expenses'|'fixedPayment'] })` lo
 * invalida automáticamente sin tener que mantenerlo a mano.
 */
export function useCommitmentExpenses(familyId?: string) {
  return useQuery<Expense[]>({
    queryKey: commitmentExpenseHistoryKey(familyId),
    enabled: Boolean(familyId),
    // Mismo staleTime que `useExpenses` — los pagos de fijos los crea
    // `record_fixed_expense_payment`, que dispara `expenses`/`fixedPayment`
    // en `syncAllAfterMutation` y por tanto invalida este key vía el
    // prefijo `expenseQueryKeys.family`.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) return []
      return loadCommitmentExpenses(familyId)
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
      // excludeArchived: el feed solo muestra el ciclo vigente. Sin esto, el
      // refetch traía gastos archivados del ciclo anterior hasta que el
      // re-seed del home_snapshot los borraba (bug "se resetea al refrescar").
      const rows = await loadExpenses(familyId, { limit: buffer, excludeArchived: true })
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

/**
 * Projects an `Expense` (the in-memory model used by `useExpenses` and
 * the home feed) into a `GastosExpenseRow` (the shape returned by the
 * `gastos_expenses_paginated` RPC). Both shapes share the bulk of
 * their fields; the projection mostly aliases names. Used to inject
 * an optimistic insert into the paginated InfiniteData so the Gastos
 * screen reflects the new row IMMEDIATELY — before the RPC roundtrip.
 */
function expenseToGastosRow(e: Expense): GastosExpenseRow {
  return {
    id: e.id,
    family_id: e.family_id,
    category_id: e.category_id,
    // `category_name` and `category_color` are normally embedded by the
    // RPC. Optimistic insert can't resolve them without the categories
    // cache; we leave them null and the row component falls back to
    // its category lookup via `categoriesQuery`. At settle the RPC
    // refetch brings the resolved values.
    category_name: null,
    category_color: null,
    commitment_id: e.commitment_id ?? null,
    description: e.description,
    notes: e.notes,
    price: e.price,
    created_at: e.created_at,
    created_by: e.created_by,
    creator_display_name: e.creator_display_name ?? '',
    // Local-day key for the optimistic row — same shape the RPC emits
    // (YYYY-MM-DD slice of created_at).
    iso_date: e.created_at.slice(0, 10),
    paid_in_arrears: e.paid_in_arrears ?? false,
  }
}

/**
 * Snapshot ALL paginated InfiniteData caches that match the family.
 * Used so optimistic mutations can roll back on error without
 * remembering which cycle window / category combination was active.
 */
function snapshotPaginatedCaches(
  qc: QueryClient,
  familyId: string,
): ReadonlyArray<readonly [readonly unknown[], unknown]> {
  return qc
    .getQueriesData({ queryKey: gastosEndpointKeys.paginatedFamily(familyId) })
    .map(([key, data]) => [key, data] as const)
}

function snapshotForDayCaches(
  qc: QueryClient,
  familyId: string,
): ReadonlyArray<readonly [readonly unknown[], unknown]> {
  return qc
    .getQueriesData({ queryKey: gastosEndpointKeys.forDayFamily(familyId) })
    .map(([key, data]) => [key, data] as const)
}

/**
 * Prepend an optimistic row to every paginated InfiniteData cache for
 * the family, plus every for-day cache where the new row's local day
 * matches. Mirrors the `expenseQueryKeys.list/recent` prepend so the
 * Gastos screen — which reads from `gastos-expenses-paginated` — shows
 * the new row instantly instead of waiting for syncAllAfterMutation.
 */
function patchPaginatedPrepend(
  qc: QueryClient,
  familyId: string,
  optimistic: Expense,
): void {
  const row = expenseToGastosRow(optimistic)
  // Recent feed pre-filters fijos auto-pagados; do the same here so
  // the optimistic insert doesn't show up in surfaces that wouldn't
  // have seen it post-settle.
  if (optimistic.commitment_id) return

  for (const [key] of qc.getQueriesData<InfiniteData<GastosExpensesPage>>({
    queryKey: gastosEndpointKeys.paginatedFamily(familyId),
  })) {
    qc.setQueryData<InfiniteData<GastosExpensesPage> | undefined>(
      key,
      (current) => {
        if (!current || !Array.isArray(current.pages) || current.pages.length === 0) {
          return current
        }
        const [firstPage, ...rest] = current.pages
        const firstPageExpenses = Array.isArray(firstPage?.expenses)
          ? firstPage.expenses
          : []
        return {
          ...current,
          pages: [
            { ...firstPage, expenses: [row, ...firstPageExpenses] },
            ...rest,
          ],
        }
      },
    )
  }

  // For-day cache: only the bucket for the row's local day. El key
  // shape es ['gastos-expenses-for-day', familyId, isoDate, categoryId].
  //
  // OJO con la shape: `useGastosExpensesForDay` queryFn devuelve
  // `GastosExpenseRow[]` directo (NO `{ expenses: GastosExpenseRow[] }`
  // — el RPC devuelve la wrapper pero el queryFn la deshace antes de
  // setear el cache). Si tratamos current como un object wrapper, el
  // `...current` spreadea el array como índices numéricos y deja un
  // mutante `{0, 1, ..., expenses: [...]}` que crashea el próximo
  // `.map`. Bug que tuvo el cache corrupto en familias con muchas
  // visitas a day-detail (regresión introducida en c56df7d).
  for (const [key] of qc.getQueriesData<GastosExpenseRow[]>({
    queryKey: gastosEndpointKeys.forDayFamily(familyId),
  })) {
    const isoDate = key[2] as string | undefined
    if (!isoDate) continue
    const rowDay = optimistic.created_at.slice(0, 10)
    if (isoDate !== rowDay) continue
    qc.setQueryData<GastosExpenseRow[] | undefined>(
      key,
      (current) => {
        if (!Array.isArray(current)) return current
        return [row, ...current]
      },
    )
  }
}

/**
 * Patch a row inside every paginated InfiniteData page + every for-day
 * cache that contains it. Used in optimistic update so los gastos v2
 * surfaces (Home + Gastos list) reflejen el cambio sin esperar al
 * refetch del onSettled. Si el id no existe en un cache, lo deja como
 * estaba. Code review M5 mobile FIX-ROUND.
 */
function patchPaginatedUpdate(
  qc: QueryClient,
  familyId: string,
  expenseId: string,
  patch: { description: string; notes: string | null; price: number },
): void {
  for (const [key] of qc.getQueriesData<InfiniteData<GastosExpensesPage>>({
    queryKey: gastosEndpointKeys.paginatedFamily(familyId),
  })) {
    qc.setQueryData<InfiniteData<GastosExpensesPage> | undefined>(
      key,
      (current) => {
        if (!current || !Array.isArray(current.pages)) return current
        return {
          ...current,
          pages: current.pages.map((p) => ({
            ...p,
            expenses: Array.isArray(p?.expenses)
              ? p.expenses.map((e) =>
                  e.id === expenseId ? { ...e, ...patch } : e,
                )
              : [],
          })),
        }
      },
    )
  }
  for (const [key] of qc.getQueriesData<GastosExpenseRow[]>({
    queryKey: gastosEndpointKeys.forDayFamily(familyId),
  })) {
    qc.setQueryData<GastosExpenseRow[] | undefined>(
      key,
      (current) => {
        if (!Array.isArray(current)) return current
        return current.map((e) =>
          e.id === expenseId ? { ...e, ...patch } : e,
        )
      },
    )
  }
}

/**
 * Remove a row from every paginated InfiniteData page + every for-day
 * cache that contains it. Used in optimistic delete.
 */
function patchPaginatedRemove(
  qc: QueryClient,
  familyId: string,
  expenseId: string,
): void {
  for (const [key] of qc.getQueriesData<InfiniteData<GastosExpensesPage>>({
    queryKey: gastosEndpointKeys.paginatedFamily(familyId),
  })) {
    qc.setQueryData<InfiniteData<GastosExpensesPage> | undefined>(
      key,
      (current) => {
        if (!current || !Array.isArray(current.pages)) return current
        return {
          ...current,
          pages: current.pages.map((p) => ({
            ...p,
            // Guard `p.expenses` because the cache shape can be polluted
            // from older / partial seeds (e.g. a page that arrived with
            // only `next_cursor` and `has_more` while expenses streamed
            // in). Crashed before with "Cannot read property 'filter'
            // of undefined" when deleting a fixed expense whose payment
            // row had landed in a half-formed page.
            expenses: Array.isArray(p?.expenses)
              ? p.expenses.filter((e) => e.id !== expenseId)
              : [],
          })),
        }
      },
    )
  }
  // For-day cache: array shape, ver nota en `patchPaginatedPrepend`.
  for (const [key] of qc.getQueriesData<GastosExpenseRow[]>({
    queryKey: gastosEndpointKeys.forDayFamily(familyId),
  })) {
    qc.setQueryData<GastosExpenseRow[] | undefined>(
      key,
      (current) => {
        if (!Array.isArray(current)) return current
        return current.filter((e) => e.id !== expenseId)
      },
    )
  }
}

function restoreCacheSnapshots(
  qc: QueryClient,
  snapshots: ReadonlyArray<readonly [readonly unknown[], unknown]>,
): void {
  for (const [key, data] of snapshots) {
    qc.setQueryData(key, data)
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

  const result = useMutation<
    void,
    Error,
    CreateExpenseInput,
    | {
        previous: ExpenseListSnapshot
        paginatedSnap: ReadonlyArray<readonly [readonly unknown[], unknown]>
        forDaySnap: ReadonlyArray<readonly [readonly unknown[], unknown]>
      }
    | undefined
  >({
    mutationFn: async ({
      categoryId,
      commitmentId,
      createdAt,
      description,
      notes,
      price,
    }) => {
      if (!familyId || !userId) {
        throw new Error(i18n.t('gastos:errors.noSessionCreate'))
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
      await queryClient.cancelQueries({
        queryKey: gastosEndpointKeys.paginatedFamily(familyId),
      })
      const previous = snapshotExpenseLists(queryClient, familyId)
      // Snapshot the paginated + for-day caches too — they're what the
      // Gastos screen actually reads from. Without these the optimistic
      // insert on `expenseQueryKeys.list/recent` was invisible there.
      const paginatedSnap = snapshotPaginatedCaches(queryClient, familyId)
      const forDaySnap = snapshotForDayCaches(queryClient, familyId)

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
        // Optimistic local-insert nunca es de un fijo vencido cobrado
        // con mora; el flag se setea en el RPC del payment. False.
        paid_in_arrears: false,
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
      // Mirror to the paginated + for-day caches the Gastos screen reads
      // from. Was missing before — the new row only landed in the home
      // recent feed (which doesn't surface inside Gastos) and the user
      // saw NO change in Gastos until the RPC roundtripped ~200-500ms
      // later.
      patchPaginatedPrepend(queryClient, familyId, optimistic)

      return { previous, paginatedSnap, forDaySnap }
    },
    onSuccess: (_data, variables) => {
      if (familyId) {
        const pushBody = `${variables.description.trim()} · $${variables.price}`
        void sendFamilyPush({
          familyId,
          title: '{actor} cargó un gasto',
          body: pushBody,
          kind: 'expense_logged',
          url: '/home',
        }).catch(() => {})
      }
    },
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous) {
        restoreExpenseLists(queryClient, familyId, ctx.previous)
      }
      if (ctx?.paginatedSnap) restoreCacheSnapshots(queryClient, ctx.paginatedSnap)
      if (ctx?.forDaySnap) restoreCacheSnapshots(queryClient, ctx.forDaySnap)
      toast.error(i18n.t('gastos:errors.saveFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
        throw new Error(i18n.t('gastos:errors.noFamilyEdit'))
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

      // Gastos v2 caches (paginated + for-day): patcheamos in-place
      // para que la edición se refleje inmediatamente en Home/Gastos
      // sin esperar el refetch. Code review M5 mobile FIX-ROUND.
      patchPaginatedUpdate(queryClient, familyId, expenseId, {
        description,
        notes: notes ?? null,
        price,
      })

      return { previous }
    },
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous) {
        restoreExpenseLists(queryClient, familyId, ctx.previous)
      }
      toast.error(i18n.t('gastos:errors.updateFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
    | {
        snapshots: ReadonlyArray<readonly [readonly unknown[], unknown]>
        paginatedSnap: ReadonlyArray<readonly [readonly unknown[], unknown]>
        forDaySnap: ReadonlyArray<readonly [readonly unknown[], unknown]>
      }
    | undefined
  >({
    mutationFn: async (expenseId) => {
      if (!familyId) {
        throw new Error(i18n.t('gastos:errors.noFamilyDelete'))
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
      await queryClient.cancelQueries({
        queryKey: gastosEndpointKeys.paginatedFamily(familyId),
      })
      const snapshots = exactKeys.map(
        (k) => [k, queryClient.getQueryData(k)] as const,
      )
      const paginatedSnap = snapshotPaginatedCaches(queryClient, familyId)
      const forDaySnap = snapshotForDayCaches(queryClient, familyId)
      for (const k of exactKeys) {
        queryClient.setQueryData<Expense[] | undefined>(k, (old) =>
          old ? old.filter((e) => e.id !== expenseId) : old,
        )
      }
      // Mirror the removal to the Gastos screen's caches. Without this,
      // the row stayed visible until the RPC roundtripped — the row's
      // own swipe-delete spinner was the only feedback.
      patchPaginatedRemove(queryClient, familyId, expenseId)
      return { snapshots, paginatedSnap, forDaySnap }
    },
    onError: (_err, expenseId, ctx) => {
      const snapshots = ctx?.snapshots ?? []
      for (const [k, data] of snapshots) {
        queryClient.setQueryData(k, data)
      }
      if (ctx?.paginatedSnap) restoreCacheSnapshots(queryClient, ctx.paginatedSnap)
      if (ctx?.forDaySnap) restoreCacheSnapshots(queryClient, ctx.forDaySnap)
      toast.error(i18n.t('gastos:errors.deleteFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
