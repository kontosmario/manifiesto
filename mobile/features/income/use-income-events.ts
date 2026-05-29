/**
 * Income events — one-time positive cash inflows beyond the
 * configured monthly salary (transfers from a friend, bonuses, gifts,
 * side income). Persisted in `public.income_events`; sums into the
 * cycle's "disponible" amount via `useHomeMetrics`.
 */

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { toast } from '@/lib/toast-bus'

export type IncomeEventKind = 'transfer' | 'bonus' | 'gift' | 'other'

export interface IncomeEvent {
  id: string
  family_id: string
  created_by: string
  amount: number
  kind: IncomeEventKind
  description: string | null
  event_date: string // ISO date "YYYY-MM-DD"
  created_at: string
}

export interface CreateIncomeEventInput {
  familyId: string
  amount: number
  kind: IncomeEventKind
  description?: string | null
  eventDate?: string // ISO date; default today (server-side via column default)
}

const ROW_COLUMNS =
  'id, family_id, created_by, amount, kind, description, event_date, created_at'

export const incomeEventQueryKeys = {
  all: ['income-events'] as const,
  list: (familyId: string | undefined) =>
    ['income-events', familyId ?? 'unknown'] as const,
  cycleSum: (familyId: string | undefined, startIso: string | undefined, endIso: string | undefined) =>
    ['income-events-cycle-sum', familyId ?? 'unknown', startIso ?? 'na', endIso ?? 'na'] as const,
}

function normalizeRow(row: Record<string, unknown>): IncomeEvent {
  return {
    id: String(row.id),
    family_id: String(row.family_id),
    created_by: String(row.created_by),
    amount: Number(row.amount ?? 0),
    kind: (row.kind as IncomeEventKind) ?? 'other',
    description: row.description == null ? null : String(row.description),
    event_date: String(row.event_date),
    created_at: String(row.created_at),
  }
}

/**
 * Sum of income events whose `event_date` falls within the current
 * pay cycle. Powers the "extra income" line in `useHomeMetrics`.
 */
export function useCycleIncomeEventsTotal(
  familyId: string | undefined,
  startIso: string | undefined,
  endIso: string | undefined,
) {
  return useQuery<number>({
    queryKey: incomeEventQueryKeys.cycleSum(familyId, startIso, endIso),
    enabled: Boolean(familyId && startIso && endIso),
    queryFn: async () => {
      if (!familyId || !startIso || !endIso) return 0
      const { data, error } = await supabase
        .from('income_events')
        .select('amount')
        .eq('family_id', familyId)
        // Inclusive start, exclusive end — matches `getCurrentPayCycle`'s
        // half-open [start, end) window.
        .gte('event_date', startIso)
        .lt('event_date', endIso)
      if (error) throw error
      const rows = (data as { amount: number | string }[] | null) ?? []
      return rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
    },
  })
}

export function useCreateIncomeEvent(userId?: string) {
  const queryClient = useQueryClient()
  const ref = useRef<{ mutate: (input: CreateIncomeEventInput) => void } | null>(
    null,
  )

  const result = useMutation<
    IncomeEvent,
    Error,
    CreateIncomeEventInput,
    { previous: IncomeEvent[] | undefined; optimisticId: string } | undefined
  >({
    mutationFn: async (input): Promise<IncomeEvent> => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const uid = userData.user?.id
      if (!uid) throw new Error('No hay sesión activa.')

      const safeAmount = Math.abs(Number(input.amount))
      if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
        throw new Error('El monto debe ser mayor a cero.')
      }

      const payload: Record<string, unknown> = {
        family_id: input.familyId,
        created_by: uid,
        amount: safeAmount,
        kind: input.kind,
        description: input.description?.trim() || null,
      }
      if (input.eventDate) {
        payload.event_date = input.eventDate
      }

      const { data, error } = await supabase
        .from('income_events')
        .insert(payload)
        .select(ROW_COLUMNS)
        .single()
      if (error) throw error
      return normalizeRow(data as Record<string, unknown>)
    },
    onMutate: async (input) => {
      const safeAmount = Math.abs(Number(input.amount))
      if (!Number.isFinite(safeAmount) || safeAmount <= 0) return undefined
      await queryClient.cancelQueries({
        queryKey: incomeEventQueryKeys.list(input.familyId),
      })
      const previous = queryClient.getQueryData<IncomeEvent[]>(
        incomeEventQueryKeys.list(input.familyId),
      )
      const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic: IncomeEvent = {
        id: optimisticId,
        family_id: input.familyId,
        created_by: userId ?? '',
        amount: safeAmount,
        kind: input.kind,
        description: input.description?.trim() || null,
        event_date: input.eventDate ?? new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<IncomeEvent[] | undefined>(
        incomeEventQueryKeys.list(input.familyId),
        (old) => (old ? [optimistic, ...old] : [optimistic]),
      )
      return { previous, optimisticId }
    },
    onError: (_err, input, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(
          incomeEventQueryKeys.list(input.familyId),
          ctx.previous,
        )
      }
      toast.error('No se pudo guardar el ingreso.', {
        actionLabel: 'Reintentar',
        onAction: () => ref.current?.mutate(input),
      })
    },
    onSettled: (_data, _err, input) => {
      void syncAllAfterMutation(queryClient, {
        familyId: input?.familyId,
        userId,
        scopes: ['income'],
      })
    },
  })

  useEffect(() => {
    ref.current = { mutate: result.mutate }
  }, [result.mutate])

  return result
}

