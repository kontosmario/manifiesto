import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { supabase } from '@/lib/supabase'
import { setCachedProfileDisplayName } from '@/lib/profile-display-name-cache'

export interface Profile {
  id: string
  display_name: string
  created_at: string
  avatar_animal: string | null
  onboarding_completed_at: string | null
  /**
   * IANA timezone the user is currently using on their device. Refreshed
   * by `useTimezoneSync` on every authenticated session. The streak
   * trigger reads this column to decide which day boundary an expense
   * belongs to (UTC was wrong; per-user is precise). Optional in the
   * type because the `home_snapshot` RPC seeds the cache with a smaller
   * column set — the explicit `useMyProfile` fetch fills it in.
   */
  timezone?: string
  /**
   * `true` once the user has completed onboarding at least once.
   * Set automatically by a SQL trigger when
   * `onboarding_completed_at` transitions from null → timestamp.
   * Never reset, even if `leave_current_family` clears the
   * `onboarding_completed_at` gate. The UI uses this to distinguish
   * brand-new users (false) from users re-entering onboarding after
   * leaving a family (true).
   *
   * Optional in the type because the `home_snapshot` RPC seeds the
   * cache with the original 5 profile columns. The first explicit
   * `useMyProfile` fetch after mount populates this field.
   */
  previously_onboarded?: boolean
  /**
   * Set by `leave_current_family` for the surviving members when an
   * owner tears the family down. The onboarding screen reads this
   * to surface a tailored "tu hogar anterior fue cerrado por su
   * dueño" message. Cleared on the next `bootstrap_family` /
   * `join_family_by_code`, or when the user finishes onboarding
   * again.
   */
  family_closed_by_owner_at?: string | null
  /**
   * Per-tour "seen" timestamps. Source of truth for whether
   * `useScreenTour` auto-fires (NULL = not seen → auto-fire;
   * timestamp = seen → skip). Settled by the `mark_tour_seen` /
   * `reset_tour_seen` / `reset_all_tours_seen` RPCs.
   *
   * Optional in the type because the `home_snapshot` RPC seeds the
   * cache with the original 5 profile columns. The first explicit
   * `useMyProfile` fetch after mount populates these fields. While
   * unset, `useToursSeen` defaults to `isSeen=true` (conservative;
   * avoids re-firing during the brief load window).
   */
  home_tour_seen_at?: string | null
  gastos_tour_seen_at?: string | null
  fijos_tour_seen_at?: string | null
  control_tour_seen_at?: string | null
}

export const profileQueryKey = (userId?: string) => ['profile', userId] as const

export function useMyProfile(userId?: string) {
  return useQuery<Profile | null>({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId),
    // Profile rarely changes mid-session. 5 min evita refetches en
    // tab-switches dentro del mismo uso. Mutations específicas
    // (display_name, avatar, timezone) invalidan este key.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!userId) {
        return null
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, created_at, avatar_animal, onboarding_completed_at, previously_onboarded, family_closed_by_owner_at, timezone, home_tour_seen_at, gastos_tour_seen_at, fijos_tour_seen_at, control_tour_seen_at',
        )
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data
    },
  })
}

export function useUpdateAvatarAnimal(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slug: string) => {
      if (!userId) {
        throw new Error('No hay sesión activa para actualizar el avatar.')
      }

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_animal: slug })
        .eq('id', userId)

      if (error) {
        throw error
      }

      return slug
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
    },
  })
}

export function useUpdateDisplayName(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rawDisplayName: string) => {
      if (!userId) {
        throw new Error('No hay sesión activa para actualizar el nombre.')
      }

      const displayName = rawDisplayName.trim()
      if (!displayName) {
        throw new Error('El display name no puede estar vacío.')
      }

      const profileResponse = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId)

      if (profileResponse.error) {
        throw profileResponse.error
      }

      const authResponse = await supabase.auth.updateUser({
        data: { display_name: displayName },
      })

      if (authResponse.error) {
        throw authResponse.error
      }

      return displayName
    },
    onSuccess: async (displayName) => {
      if (userId) {
        setCachedProfileDisplayName(userId, displayName)
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
      ])
    },
  })
}
