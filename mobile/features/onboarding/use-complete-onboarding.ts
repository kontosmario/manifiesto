import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'
import { entitlementQueryKey } from '@/features/billing/use-entitlement'
import { resetAllTours } from '@/features/tours/persistence'
import { deletePersistentValue } from '@/lib/persistent-kv'

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
      // Sync cache write FIRST so the new RequireAuth render on the
      // success route sees onboarding_completed_at set (prevents bounce
      // back to /(app)/onboarding).
      queryClient.setQueryData<Profile | undefined>(
        profileQueryKey(userId),
        (prev) =>
          prev
            ? { ...prev, onboarding_completed_at: completedAt }
            : prev,
      )
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      // Al completar el onboarding se setea onboarding_completed_at → el
      // SubscriptionGate recién acá puede bloquear. Refrescamos el entitlement
      // para que el gate evalúe el snapshot correcto (trial de la familia nueva),
      // no un BLOCKED stale de la ventana sin-familia del reset.
      await queryClient.invalidateQueries({ queryKey: entitlementQueryKey(userId) })

      // Reset tour-seen flags so the home/gastos/fijos/control tours
      // auto-fire for this brand-new account. The flags live device-wide
      // in SecureStore; a previous user (or test) on this device could
      // have left them set, which would otherwise suppress tours for
      // anyone signing up afterwards.
      await resetAllTours()
      // Also clear the backfill-done flag so the AppEntryGate hook re-
      // evaluates against the now-recent onboarding timestamp (this user
      // is "new", not "existing", so backfill should be a no-op).
      await deletePersistentValue('tours-backfill-done')
    },
  })
}
