import {
  type QueryClient,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  profileQueryKey,
  type Profile,
} from '@/features/profile/use-profile'
import { supabase } from '@/lib/supabase'
import { clearTourPending, setTourPending } from './tour-pending-store'
import type { TourKey } from './tour-keys'

const COLUMN_FOR: Record<TourKey, keyof Profile> = {
  home: 'home_tour_seen_at',
  gastos: 'gastos_tour_seen_at',
  fijos: 'fijos_tour_seen_at',
  control: 'control_tour_seen_at',
}

export interface MarkTourSeenContext {
  previous: Profile | null
}

/**
 * Pure factory for the mark-tour-seen mutation options. Extracted so
 * tests can drive `mutationFn` / `onMutate` / `onError` without a
 * React renderer. The hook below is the production wiring.
 */
export function buildMarkTourSeenMutation(
  queryClient: QueryClient,
  userId: string | undefined,
): UseMutationOptions<void, Error, TourKey, MarkTourSeenContext> {
  return {
    mutationFn: async (key: TourKey) => {
      const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
      if (error) {
        await setTourPending(key)
        throw error
      }
      await clearTourPending(key)
    },
    onMutate: async (key: TourKey) => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey) ?? null
      if (previous) {
        const next: Profile = {
          ...previous,
          [COLUMN_FOR[key]]: new Date().toISOString(),
        }
        queryClient.setQueryData(queryKey, next)
      }
      return { previous }
    },
    onError: (_error, _key, context) => {
      if (!userId || !context?.previous) return
      queryClient.setQueryData(profileQueryKey(userId), context.previous)
    },
  }
}

/**
 * Mark a tour as seen on the backend. Optimistic: writes the
 * timestamp into the profile cache immediately, then awaits the RPC.
 * On failure, rolls back the cache and writes a `tour-seen-pending.<key>`
 * flag in SecureStore that `useMigrateToursToBackend` retries on the
 * next launch.
 */
export function useMarkTourSeen() {
  const queryClient = useQueryClient()
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id
  return useMutation(buildMarkTourSeenMutation(queryClient, userId))
}
