// User-controlled mute list at the signal-family level.
//
// Reads / writes the `user_signal_blocklist` table directly via
// supabase-js. RLS guarantees a user can only see and mutate their
// own rows; the policies were created in the memory-layer migration.
// Entries are keyed by `(user_id, signal_family)` — once a family is
// blocked, every signal whose `signalFamilyOf(id)` matches is filtered
// out before reaching the surface.
//
// Like the rest of the cognitive layer, the hook degrades gracefully
// while the migration is applied — failures return an empty set so
// builders never crash on a missing table.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { signalFamilyOf } from '@/features/insights/signal-family'

interface BlocklistRow {
  signal_family: string
  reason: string | null
  blocked_at: string
}

const STALE_TIME = 5 * 60_000

const queryKey = (userId: string | null) =>
  ['user-signal-blocklist', userId ?? null] as const

export function useSignalBlocklist(userId: string | null | undefined) {
  return useQuery<ReadonlySet<string>>({
    queryKey: queryKey(userId ?? null),
    enabled: Boolean(userId),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) return new Set<string>()
      try {
        const { data, error } = await supabase
          .from('user_signal_blocklist')
          .select('signal_family')
          .eq('user_id', userId)
        if (error) return new Set<string>()
        return new Set((data ?? []).map((r: { signal_family: string }) => r.signal_family))
      } catch {
        return new Set<string>()
      }
    },
  })
}

interface BlockArgs {
  userId: string
  signalId: string
  reason?: string
}

export function useBlockSignalFamily() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: BlockArgs) => {
      const family = signalFamilyOf(args.signalId)
      const { error } = await supabase
        .from('user_signal_blocklist')
        .upsert(
          {
            user_id: args.userId,
            signal_family: family,
            reason: args.reason ?? null,
          },
          { onConflict: 'user_id,signal_family' },
        )
      if (error) throw error
      return family
    },
    onSuccess: (_family, args) => {
      queryClient.invalidateQueries({ queryKey: queryKey(args.userId) })
    },
  })
}

export function useUnblockSignalFamily() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { userId: string; family: string }) => {
      const { error } = await supabase
        .from('user_signal_blocklist')
        .delete()
        .eq('user_id', args.userId)
        .eq('signal_family', args.family)
      if (error) throw error
    },
    onSuccess: (_d, args) => {
      queryClient.invalidateQueries({ queryKey: queryKey(args.userId) })
    },
  })
}

type ListEntryRow = BlocklistRow

export function useSignalBlocklistEntries(userId: string | null | undefined) {
  return useQuery<ListEntryRow[]>({
    queryKey: ['user-signal-blocklist-entries', userId ?? null] as const,
    enabled: Boolean(userId),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) return []
      try {
        const { data, error } = await supabase
          .from('user_signal_blocklist')
          .select('signal_family, reason, blocked_at')
          .eq('user_id', userId)
          .order('blocked_at', { ascending: false })
        if (error) return []
        return (data ?? []) as ListEntryRow[]
      } catch {
        return []
      }
    },
  })
}

// "Clear advisor history" — pending a follow-up migration that adds a
// `delete_own` policy on `advisor_interactions`. The current memory-
// layer migration only grants SELECT to the user, so DELETE-from-
// client returns "permission denied". When the policy is added, the
// hook can land here without further surface changes.
