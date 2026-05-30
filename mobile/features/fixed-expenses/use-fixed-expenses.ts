import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { sendFamilyPush } from '@/lib/send-family-push'
import { toast } from '@/lib/toast-bus'
import { captureHikeReduction } from '@/features/insights/fixed-expense-value-capture'
import type { FixedExpensePayment } from '@/features/fixed-expenses/fixed-expense-payment.model'
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
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) {
        return []
      }
      return fetchFixedExpenses(familyId)
    },
  })
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeTentativeId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Construye un FixedExpense optimista a partir del input de upsert.
 *  Los campos no-presentes en el input se setean a defaults razonables;
 *  el refetch del syncAll trae el row real con id + timestamps del server. */
function buildOptimisticFixed(
  familyId: string,
  input: UpsertFixedExpenseInput,
): FixedExpense {
  const now = new Date().toISOString()
  return {
    id: makeTentativeId(),
    family_id: familyId,
    name: input.name,
    amount: input.amount,
    kind: input.kind,
    status: input.status ?? 'active',
    frequency: input.frequency,
    category_id: input.categoryId,
    next_due_on: input.nextDueOn,
    day_of_month: input.dayOfMonth,
    ends_on: input.endsOn ?? null,
    installments_total: input.installmentsTotal ?? null,
    installments_paid: input.installmentsPaid ?? 0,
    remaining_balance: input.remainingBalance ?? null,
    lender_name: input.lenderName ?? null,
    notes: input.notes ?? null,
    notify_days_before: input.notifyDaysBefore ?? null,
    last_paid_at: null,
    created_at: now,
    updated_at: now,
  }
}

/** Patch parcial sobre un FixedExpense existente desde un UpsertInput. */
function patchFixedFromInput(
  current: FixedExpense,
  input: UpsertFixedExpenseInput,
): FixedExpense {
  return {
    ...current,
    name: input.name,
    amount: input.amount,
    kind: input.kind,
    status: input.status ?? current.status,
    frequency: input.frequency,
    category_id: input.categoryId,
    next_due_on: input.nextDueOn,
    day_of_month: input.dayOfMonth,
    ends_on: input.endsOn ?? null,
    installments_total: input.installmentsTotal ?? null,
    installments_paid: input.installmentsPaid ?? current.installments_paid,
    remaining_balance: input.remainingBalance ?? null,
    lender_name: input.lenderName ?? null,
    notes: input.notes ?? null,
    notify_days_before: input.notifyDaysBefore ?? null,
    updated_at: new Date().toISOString(),
  }
}

// ── Mutations ───────────────────────────────────────────────────────

export function useCreateFixedExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: UpsertFixedExpenseInput) => void } | null>(null)

  const result = useMutation<
    void,
    Error,
    UpsertFixedExpenseInput,
    { previous: FixedExpense[] | undefined } | undefined
  >({
    mutationFn: async (input) => {
      if (!familyId) {
        throw new Error('No hay familia activa para crear un gasto fijo.')
      }
      await createFixedExpense(familyId, input)
    },
    onMutate: async (input) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
      const previous = queryClient.getQueryData<FixedExpense[]>(
        fixedExpenseQueryKeys.family(familyId),
      )
      const optimistic = buildOptimisticFixed(familyId, input)
      queryClient.setQueryData<FixedExpense[] | undefined>(
        fixedExpenseQueryKeys.family(familyId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      )
      return { previous }
    },
    onSuccess: (_data, variables) => {
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
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous !== undefined) {
        queryClient.setQueryData(
          fixedExpenseQueryKeys.family(familyId),
          ctx.previous,
        )
      }
      toast.error('No se pudo crear el gasto fijo.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['fixed'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useUpdateFixedExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: UpdateFixedExpenseInput) => void } | null>(null)

  const result = useMutation<
    void,
    Error,
    UpdateFixedExpenseInput,
    { previous: FixedExpense[] | undefined } | undefined
  >({
    mutationFn: async (input) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar un gasto fijo.')
      }
      await updateFixedExpense(familyId, input)
    },
    onMutate: async (input) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
      const previous = queryClient.getQueryData<FixedExpense[]>(
        fixedExpenseQueryKeys.family(familyId),
      )
      queryClient.setQueryData<FixedExpense[] | undefined>(
        fixedExpenseQueryKeys.family(familyId),
        (old) =>
          old?.map((f) =>
            f.id === input.fixedExpenseId ? patchFixedFromInput(f, input) : f,
          ),
      )
      return { previous }
    },
    onSuccess: (_data, variables) => {
      // Counterfactual value capture: si el user bajó el amount de un
      // fijo que había firado `price_hike`, log la baja antes de
      // invalidar (lee el previous amount del cache).
      if (familyId) {
        void captureHikeReduction({
          queryClient,
          familyId,
          fixedExpenseId: variables.fixedExpenseId,
          newAmount: variables.amount,
        })
      }

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
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous !== undefined) {
        queryClient.setQueryData(
          fixedExpenseQueryKeys.family(familyId),
          ctx.previous,
        )
      }
      toast.error('No se pudo actualizar el gasto fijo.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['fixed'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useUpdateFixedExpenseStatus(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{
    mutate: (input: { fixedExpenseId: string; status: FixedExpenseStatus }) => void
  } | null>(null)

  const result = useMutation<
    void,
    Error,
    { fixedExpenseId: string; status: FixedExpenseStatus },
    { previous: FixedExpense[] | undefined } | undefined
  >({
    mutationFn: async ({ fixedExpenseId, status }) => {
      if (!familyId) {
        throw new Error('No hay familia activa para actualizar el gasto fijo.')
      }
      await updateFixedExpenseStatus(familyId, fixedExpenseId, status)
    },
    onMutate: async ({ fixedExpenseId, status }) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
      const previous = queryClient.getQueryData<FixedExpense[]>(
        fixedExpenseQueryKeys.family(familyId),
      )
      queryClient.setQueryData<FixedExpense[] | undefined>(
        fixedExpenseQueryKeys.family(familyId),
        (old) =>
          old?.map((f) =>
            f.id === fixedExpenseId ? { ...f, status } : f,
          ),
      )
      return { previous }
    },
    onError: (_err, input, ctx) => {
      if (familyId && ctx?.previous !== undefined) {
        queryClient.setQueryData(
          fixedExpenseQueryKeys.family(familyId),
          ctx.previous,
        )
      }
      toast.error('No se pudo actualizar el estado del fijo.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['fixed'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export interface RecordFixedExpensePaymentVars {
  fixedExpenseId: string
  /** Monto realmente pagado, capturado por el sheet de confirmación
   *  (`ConfirmFixedPaymentSheet`). Cuando es `undefined`, el RPC usa
   *  el `amount` base del commitment. Cuando difiere de ese amount,
   *  el RPC lo persiste como nuevo amount base. */
  amountOverride?: number
}

export function useRecordFixedExpensePayment(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{
    mutate: (input: RecordFixedExpensePaymentVars) => void
  } | null>(null)

  const result = useMutation<
    void,
    Error,
    RecordFixedExpensePaymentVars,
    | {
        previous: FixedExpense[] | undefined
        optimisticPaymentId: string | null
      }
    | undefined
  >({
    mutationFn: async (vars) => {
      if (!familyId) {
        throw new Error('No hay familia activa para registrar el pago.')
      }
      await recordFixedExpensePayment({
        fixedExpenseId: vars.fixedExpenseId,
        amountOverride: vars.amountOverride,
      })
    },
    onMutate: async ({ fixedExpenseId, amountOverride }) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
      const previous = queryClient.getQueryData<FixedExpense[]>(
        fixedExpenseQueryKeys.family(familyId),
      )
      const nowIso = new Date().toISOString()
      queryClient.setQueryData<FixedExpense[] | undefined>(
        fixedExpenseQueryKeys.family(familyId),
        (old) =>
          old?.map((f) =>
            f.id === fixedExpenseId
              ? {
                  ...f,
                  last_paid_at: nowIso,
                  // Si el sheet confirmó un override, reflejamos el
                  // nuevo amount localmente para que la card y el chip
                  // de tendencia muestren el valor correcto antes del
                  // refetch (el RPC también lo persiste DB-side).
                  amount:
                    typeof amountOverride === 'number'
                      ? amountOverride
                      : f.amount,
                  // Para installments: optimistamente incrementamos el
                  // contador; el syncAll refetch corrige si difiere.
                  installments_paid:
                    f.kind === 'installment'
                      ? f.installments_paid + 1
                      : f.installments_paid,
                }
              : f,
          ),
      )

      // ── Optimistic insert en TODOS los caches de fixed_expense_payments.
      //
      // CRÍTICO (fix 2026-05-30): sin esto, había un bug donde después
      // de pagar un fijo monthly el row aparecía en la tab "Próximos"
      // en vez de "Pagados". Mecanismo:
      //   1. RPC avanza `fixed_expenses.next_due_on` al mes siguiente
      //      (afuera del ciclo actual).
      //   2. RPC inserta `fixed_expense_payments` row con paid_at = now().
      //   3. Client recibe la nueva `next_due_on` casi inmediato (el
      //      cache de fixed_expenses se invalida y refetcha).
      //   4. PERO el cache de fixed_expense_payments puede tardar más
      //      en refrescar (cycle-scoped key, seed del home_snapshot
      //      puede landear en un cache key con ISO ligeramente distinto
      //      al que lee el consumer por drift de TZ).
      //   5. Durante el gap, `paidThisPeriod = false` (sin payment row)
      //      Y `next_due_on >= cycleEnd` (advancido) → status = 'future'.
      //   6. UI: fijo aparece en "Próximos" en vez de "Pagados".
      //
      // Fix: insertar optimísticamente un payment row en TODOS los
      // caches que matcheen el prefijo `['fixed-expense-payments', ...]`.
      // setQueriesData con un filtro de queryKey hace match por prefijo
      // (sin `exact: true`) → cubre todas las variantes de cycle window
      // que estén vivas. Como `paidThisPeriod` gana sobre cualquier
      // otro check, el row salta a "Pagados" inmediatamente y se queda
      // ahí cuando el refetch reconcilia con el row real del server.
      //
      // En `onError` removemos este row optimista por id.
      const optimisticPaymentId = `optimistic-${nowIso}-${fixedExpenseId}`
      if (userId) {
        const periodMonth = nowIso.slice(0, 7) + '-01' // YYYY-MM-01
        const optimisticRow: FixedExpensePayment = {
          id: optimisticPaymentId,
          fixedExpenseId,
          periodMonth,
          paidAt: nowIso,
          paidBy: userId,
          createdAt: nowIso,
        }
        queryClient.setQueriesData<FixedExpensePayment[] | undefined>(
          // Prefix-only match: cualquier cache que arranque con este
          // tuple, sin importar el cycle window que lleve adelante.
          { queryKey: ['fixed-expense-payments'] },
          (old) => {
            if (!old) return old
            // Dedup defensivo: si por alguna razón ya existe un row
            // para este fixed_expense_id (ej: race condition con un
            // realtime que llegó primero), no duplicamos.
            if (old.some((p) => p.fixedExpenseId === fixedExpenseId)) {
              return old
            }
            return [...old, optimisticRow]
          },
        )
      }

      return { previous, optimisticPaymentId: userId ? optimisticPaymentId : null }
    },
    onError: (_err, vars, ctx) => {
      if (familyId && ctx?.previous !== undefined) {
        queryClient.setQueryData(
          fixedExpenseQueryKeys.family(familyId),
          ctx.previous,
        )
      }
      // Rollback del row optimista de payments si lo habíamos insertado.
      if (ctx?.optimisticPaymentId) {
        const optimisticId = ctx.optimisticPaymentId
        queryClient.setQueriesData<FixedExpensePayment[] | undefined>(
          { queryKey: ['fixed-expense-payments'] },
          (old) => (old ? old.filter((p) => p.id !== optimisticId) : old),
        )
      }
      toast.error('No se pudo registrar el pago.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(vars),
      })
    },
    onSettled: () => {
      // fixedPayment dispara un expense vía trigger DB → invalidamos
      // también el cluster de expenses para que Home/Gastos refresquen.
      // El refetch reconcilia el row optimista con el real del server
      // (queryFn devuelve el shape completo desde DB).
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['fixedPayment'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

export function useDeleteFixedExpense(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: string) => void } | null>(null)

  const result = useMutation<
    void,
    Error,
    string,
    { previous: FixedExpense[] | undefined } | undefined
  >({
    mutationFn: async (fixedExpenseId) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar un gasto fijo.')
      }
      await deleteFixedExpense(familyId, fixedExpenseId)
    },
    onMutate: async (fixedExpenseId) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
      const previous = queryClient.getQueryData<FixedExpense[]>(
        fixedExpenseQueryKeys.family(familyId),
      )
      queryClient.setQueryData<FixedExpense[] | undefined>(
        fixedExpenseQueryKeys.family(familyId),
        (old) => old?.filter((f) => f.id !== fixedExpenseId),
      )
      return { previous }
    },
    onSuccess: () => {
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
    onError: (_err, fixedExpenseId, ctx) => {
      if (familyId && ctx?.previous !== undefined) {
        queryClient.setQueryData(
          fixedExpenseQueryKeys.family(familyId),
          ctx.previous,
        )
      }
      toast.error('No se pudo borrar el gasto fijo.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(fixedExpenseId),
      })
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['fixed'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}
