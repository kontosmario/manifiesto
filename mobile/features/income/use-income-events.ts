/**
 * Income events — one-time positive cash inflows beyond the
 * configured monthly salary (transfers from a friend, bonuses, gifts,
 * side income). Persisted in `public.income_events`; sums into the
 * cycle's "disponible" amount via `useHomeMetrics`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invalidateFamilyBudgetData } from '@/features/family/family-query-invalidation'

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
 * List all income events for a family, newest event_date first. Used
 * by the optional "Ingresos extra" surface on Home / month summary.
 */
export function useIncomeEvents(familyId?: string, limit = 50) {
  return useQuery<IncomeEvent[]>({
    queryKey: incomeEventQueryKeys.list(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) return []
      const { data, error } = await supabase
        .from('income_events')
        .select(ROW_COLUMNS)
        .eq('family_id', familyId)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeRow)
    },
  })
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

export function useCreateIncomeEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateIncomeEventInput): Promise<IncomeEvent> => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData.user?.id
      if (!userId) throw new Error('No hay sesión activa.')

      const safeAmount = Math.abs(Number(input.amount))
      if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
        throw new Error('El monto debe ser mayor a cero.')
      }

      const payload: Record<string, unknown> = {
        family_id: input.familyId,
        created_by: userId,
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
    onSuccess: (created) => {
      // Invalidate income lists + cycle sum so home metrics refresh.
      void queryClient.invalidateQueries({
        queryKey: incomeEventQueryKeys.list(created.family_id),
      })
      void queryClient.invalidateQueries({
        queryKey: ['income-events-cycle-sum', created.family_id],
      })
      // Family budget data depends on the cycle sum — refresh metrics.
      void invalidateFamilyBudgetData(queryClient, created.family_id)
    },
  })
}

export function useDeleteIncomeEvent(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { error } = await supabase.from('income_events').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      if (!familyId) return
      void queryClient.invalidateQueries({
        queryKey: incomeEventQueryKeys.list(familyId),
      })
      void queryClient.invalidateQueries({
        queryKey: ['income-events-cycle-sum', familyId],
      })
      void invalidateFamilyBudgetData(queryClient, familyId)
    },
  })
}
