import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { supabase } from '@/lib/supabase'
import { setCachedProfileDisplayName } from '@/lib/profile-display-name-cache'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'

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
   * Idioma preferido del usuario ('es' | 'en'), sincronizado por
   * `useLanguageSync`. Lo usa el servidor para localizar las push
   * notifications (se generan por cron con el usuario fuera de la app).
   * Opcional: el `home_snapshot` RPC seedea un set chico de columnas.
   */
  preferred_language?: 'es' | 'en' | null
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
  /**
   * Set when the user submitted `request_account_deletion`. Cleared
   * by `cancel_account_deletion`. The CancelDeletionBanner on home /
   * settings (and the welcome-screen variant) reads this to surface
   * a non-dismissible "tu cuenta se eliminará el X · cancelar" CTA
   * during the 30-day grace window — see Sprint J · Audit #3 J-Auth2.
   *
   * Optional in the type because `home_snapshot` seeds the cache with
   * a smaller column set; the explicit `useMyProfile` fetch fills it.
   */
  deletion_scheduled_at?: string | null
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
          'id, display_name, created_at, avatar_animal, onboarding_completed_at, previously_onboarded, family_closed_by_owner_at, timezone, home_tour_seen_at, gastos_tour_seen_at, fijos_tour_seen_at, control_tour_seen_at, deletion_scheduled_at',
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

export function useUpdateAvatarAnimal(userId?: string, familyId?: string) {
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
    // Code review H6 (sprint A, 2026-06-08): el avatar aparece en
    // home_snapshot (header del Home) y en el family strip (roster
    // por miembro). `syncAllAfterMutation` con scope `profile` cubre
    // tanto profile, family-members como home_snapshot — no hace falta
    // duplicar invalidates aparte (CR v3 M1).
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['profile'],
      })
    },
  })
}

export function useUpdateDisplayName(userId?: string, familyId?: string) {
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
    onSuccess: (displayName) => {
      if (userId) {
        setCachedProfileDisplayName(userId, displayName)
      }
    },
    // Code review H6 (sprint A, 2026-06-08): el nombre se muestra en
    // home_snapshot (header), expense rows (created_by_name) y family
    // roster. `syncAllAfterMutation` con scope `profile` cubre profile,
    // family-members y home_snapshot. Mantenemos sólo
    // `expenseQueryKeys.all` aparte porque la lista de gastos
    // renderea el display_name del autor en cada row — no es parte
    // de los scopes del helper (CR v3 M1: dedup invalidates).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all })
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['profile'],
      })
    },
  })
}
