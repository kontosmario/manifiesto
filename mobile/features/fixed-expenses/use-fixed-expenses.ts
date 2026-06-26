import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import {
  createFixedExpense,
  deleteFixedExpense,
  fetchFixedExpenses,
  recordFixedExpensePayment,
  revertFixedExpensePayment,
  updateFixedExpense,
  updateFixedExpenseStatus,
  type UpdateFixedExpenseInput,
  type UpsertFixedExpenseInput,
} from '@/features/fixed-expenses/fixed-expense-repository'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { sendFamilyPush } from '@/lib/send-family-push'
import { toast } from '@/lib/toast-bus'
import i18n from '@/lib/i18n'
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

  // Devolvemos `{ id }` para que el form de "Crear fijo" pueda
  // encadenar `recordFixedExpensePayment` cuando el user marca "Ya
  // pagué la cuota más reciente" en el wizard de creación.
  const result = useMutation<
    { id: string } | null,
    Error,
    UpsertFixedExpenseInput,
    { previous: FixedExpense[] | undefined } | undefined
  >({
    mutationFn: async (input) => {
      if (!familyId) {
        throw new Error(i18n.t('fijos:errors.noFamilyCreate'))
      }
      return await createFixedExpense(familyId, input)
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
          // @i18n-ignore (server-bound: push se localiza por idioma del RECEPTOR, no del emisor — wrap con t() del emisor sería incorrecto; localización server-side es follow-up)
          title: '{actor} sumó un gasto fijo',
          familyId,
          body: pushBody,
          kind: 'fixed_created',
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
      toast.error(i18n.t('fijos:errors.createFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
        throw new Error(i18n.t('fijos:errors.noFamilyEdit'))
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
          // @i18n-ignore (server-bound: push se localiza por idioma del RECEPTOR, no del emisor — wrap con t() del emisor sería incorrecto; localización server-side es follow-up)
          title: '{actor} editó un gasto fijo',
          familyId,
          body: pushBody,
          kind: 'fixed_edited',
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
      toast.error(i18n.t('fijos:errors.updateFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
        throw new Error(i18n.t('fijos:errors.noFamilyUpdate'))
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
      toast.error(i18n.t('fijos:errors.statusUpdateFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
        throw new Error(i18n.t('fijos:errors.noFamilyRecord'))
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
          // Optimistic row sin expense_id real — el refetch reconcilia
          // con el id verdadero del expense generado por la RPC.
          expenseId: null,
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
      toast.error(i18n.t('fijos:errors.recordPaymentFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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

/**
 * Revierte un pago confirmado. Toma el `paymentId` del row de
 * `fixed_expense_payments` (no el id del fijo). La RPC borra el
 * expense generado, borra el payment row, retrocede next_due_on y
 * restaura last_paid_at.
 *
 * Optimistic update: removemos el payment del cache para que el row
 * vuelva a aparecer como pending inmediatamente (en vez de paid). El
 * refetch reconcilia next_due_on / last_paid_at / installments_paid
 * con los valores reales post-rollback.
 */
export function useRevertFixedExpensePayment(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (paymentId: string) => void } | null>(null)

  const result = useMutation<
    void,
    Error,
    string,
    { previousPayments: Map<string, FixedExpensePayment[]> } | undefined
  >({
    mutationFn: async (paymentId) => {
      if (!familyId) {
        throw new Error(i18n.t('fijos:errors.noFamilyRevert'))
      }
      await revertFixedExpensePayment(paymentId)
    },
    onMutate: async (paymentId) => {
      if (!familyId) return undefined
      await queryClient.cancelQueries({
        queryKey: ['fixed-expense-payments'],
      })
      // Snapshot de todos los caches que matchean el prefijo, para poder
      // rollback en onError.
      const snapshots = queryClient.getQueriesData<FixedExpensePayment[]>({
        queryKey: ['fixed-expense-payments'],
      })
      const previousPayments = new Map<string, FixedExpensePayment[]>()
      for (const [key, value] of snapshots) {
        if (Array.isArray(value)) previousPayments.set(JSON.stringify(key), value)
      }
      // Remove el payment de todos los caches optimisticamente.
      queryClient.setQueriesData<FixedExpensePayment[] | undefined>(
        { queryKey: ['fixed-expense-payments'] },
        (old) => (old ? old.filter((p) => p.id !== paymentId) : old),
      )
      return { previousPayments }
    },
    onError: (_err, paymentId, ctx) => {
      if (ctx?.previousPayments) {
        for (const [serializedKey, value] of ctx.previousPayments) {
          queryClient.setQueryData(JSON.parse(serializedKey), value)
        }
      }
      toast.error(i18n.t('fijos:errors.revertPaymentFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
        onAction: () => ref.current?.mutate(paymentId),
      })
    },
    onSettled: () => {
      // Mismo scope que el pay: la reversión también afecta expenses,
      // fixed_expenses (next_due_on / last_paid_at), achievements, etc.
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
        throw new Error(i18n.t('fijos:errors.noFamilyDelete'))
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
          // @i18n-ignore (server-bound: push se localiza por idioma del RECEPTOR, no del emisor — wrap con t() del emisor sería incorrecto; localización server-side es follow-up)
          title: '{actor} eliminó un gasto fijo',
          familyId,
          body: '',
          kind: 'fixed_deleted',
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
      toast.error(i18n.t('fijos:errors.deleteFailed'), {
        actionLabel: i18n.t('common:actions.retry'),
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
