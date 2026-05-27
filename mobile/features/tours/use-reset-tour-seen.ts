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
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

const COLUMN_FOR: Record<TourKey, keyof Profile> = {
  home: 'home_tour_seen_at',
  gastos: 'gastos_tour_seen_at',
  fijos: 'fijos_tour_seen_at',
  control: 'control_tour_seen_at',
}

export interface ResetTourSeenContext {
  previous: Profile | null
}

/**
 * Pure factory for the reset-one-tour mutation options. Extracted so
 * tests can drive `mutationFn` / `onMutate` / `onError` without a
 * React renderer.
 */
export function buildResetTourSeenMutation(
  queryClient: QueryClient,
  userId: string | undefined,
): UseMutationOptions<void, Error, TourKey, ResetTourSeenContext> {
  return {
    mutationFn: async (key: TourKey) => {
      const { error } = await supabase.rpc('reset_tour_seen', { tour_key: key })
      if (error) throw error
    },
    onMutate: async (key: TourKey) => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey) ?? null
      if (previous) {
        const next: Profile = {
          ...previous,
          [COLUMN_FOR[key]]: null,
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
 * Pure factory for the reset-all-tours mutation options. Extracted so
 * tests can drive `mutationFn` / `onMutate` / `onError` without a
 * React renderer.
 */
export function buildResetAllToursSeenMutation(
  queryClient: QueryClient,
  userId: string | undefined,
): UseMutationOptions<void, Error, void, ResetTourSeenContext> {
  return {
    mutationFn: async () => {
      const { error } = await supabase.rpc('reset_all_tours_seen')
      if (error) throw error
    },
    onMutate: async () => {
      if (!userId) return { previous: null }
      const queryKey = profileQueryKey(userId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile | null>(queryKey) ?? null
      if (previous) {
        const next: Profile = { ...previous }
        for (const k of ALL_TOUR_KEYS) {
          ;(next as Record<string, unknown>)[COLUMN_FOR[k]] = null
        }
        queryClient.setQueryData(queryKey, next)
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (!userId || !context?.previous) return
      queryClient.setQueryData(profileQueryKey(userId), context.previous)
    },
  }
}

/**
 * Reset a single tour (or all tours) on the backend. Optimistic:
 * nulls the relevant `*_tour_seen_at` column(s) in the profile cache
 * immediately, then awaits the RPC. On failure, rolls back the cache.
 *
 * No SecureStore pending fallback here — reset is a user-initiated
 * action from Settings; if it fails the user can retry.
 */
export function useResetTourSeen(): {
  resetOne: (key: TourKey) => Promise<void>
  resetAll: () => Promise<void>
  isResettingOne: boolean
  isResettingAll: boolean
} {
  const queryClient = useQueryClient()
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id

  const resetOneMutation = useMutation(
    buildResetTourSeenMutation(queryClient, userId),
  )
  const resetAllMutation = useMutation(
    buildResetAllToursSeenMutation(queryClient, userId),
  )

  return {
    resetOne: async (key) => {
      await resetOneMutation.mutateAsync(key)
    },
    resetAll: async () => {
      await resetAllMutation.mutateAsync()
    },
    isResettingOne: resetOneMutation.isPending,
    isResettingAll: resetAllMutation.isPending,
  }
}
