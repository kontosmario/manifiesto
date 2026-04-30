// Family-scoped Supabase realtime channel.
//
// Originally lived as `useHomeRealtime` only, but the same listener
// shape is useful for any tab (Home, Gastos, Fijos) that wants to
// reflect partner edits without pull-to-refresh. Extracted as a
// generic helper that takes the table → invalidation map so each
// screen mounts only the subscriptions it cares about.
//
// Lifecycle:
//   - Channel opens on mount, closes on unmount.
//   - Channel name `family-realtime:{familyId}:{scope}` so multiple
//     tabs of the same user can co-exist with distinct names.
//   - All listeners scope by `family_id` server-side. RLS is the
//     final authority; the filter is just a server-side optimization.

import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type FamilyRealtimeTable =
  | 'expenses'
  | 'fixed_expenses'
  | 'fixed_expense_payments'
  | 'savings_goals'
  | 'notifications'
  | 'categories'

export type FamilyRealtimeInvalidator = (queryClient: QueryClient, familyId: string) => void

export interface UseFamilyRealtimeArgs {
  familyId?: string
  /** Distinguishes channels when multiple screens of the same user
   *  open subscriptions to the same family at once. Use the screen
   *  name (e.g., "home", "gastos"). */
  scope: string
  /** Map of table → invalidator. Each invalidator receives the
   *  queryClient + familyId and is expected to call
   *  `invalidateQueries` on whatever caches the screen depends on. */
  listeners: Partial<Record<FamilyRealtimeTable, FamilyRealtimeInvalidator>>
}

export function useFamilyRealtime({ familyId, scope, listeners }: UseFamilyRealtimeArgs) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!familyId) return

    const filter = `family_id=eq.${familyId}`
    let channel = supabase.channel(`family-realtime:${familyId}:${scope}`)

    for (const [table, invalidator] of Object.entries(listeners) as [
      FamilyRealtimeTable,
      FamilyRealtimeInvalidator,
    ][]) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => invalidator(queryClient, familyId),
      )
    }

    channel.subscribe()

    return () => {
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
    // We intentionally exclude `listeners` from the dep array — its
    // identity changes per render in most callers (passed inline). The
    // useEffect re-creates listeners only when familyId/scope change,
    // which is the correct lifetime. If a caller swaps a listener at
    // runtime they should also bump `scope`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, scope, queryClient])
}
