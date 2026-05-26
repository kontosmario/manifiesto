import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'

/**
 * Flips `profiles.onboarding_completed_at` to `now()` for the current
 * user. Called at the end of the wizard — after this resolves the guard
 * in `RequireAuth` lets the user land on Home.
 */
export function useCompleteOnboarding(userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para completar el onboarding.')
      }

      const completedAt = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: completedAt })
        .eq('id', userId)

      if (error) {
        throw error
      }

      return completedAt
    },
    onSuccess: async (completedAt) => {
      // Write the cache SYNCHRONOUSLY before invalidation so the next
      // render of `RequireAuth` (on the success route) sees the new
      // timestamp and doesn't bounce the user back to /(app)/onboarding.
      // The async invalidate kicks off a background refetch to confirm.
      queryClient.setQueryData<Profile | undefined>(
        profileQueryKey(userId),
        (prev) =>
          prev
            ? { ...prev, onboarding_completed_at: completedAt }
            : prev,
      )
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
    },
  })
}
