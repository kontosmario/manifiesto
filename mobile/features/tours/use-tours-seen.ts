import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import type { TourKey } from './tour-keys'

/**
 * Read-side hook for tour-seen state. Source of truth: the 4
 * `_tour_seen_at` columns on `profiles`, fetched via `useMyProfile`
 * and cached by React Query.
 *
 * Conservative loading default: while profile is loading or missing,
 * `isSeen()` returns `true` for every tour. Better to under-show a
 * tour than to spam the user with one they've already seen. In
 * practice the profile fetch resolves before any tour screen mounts
 * (AppEntryGate blocks on it), so the loading window is ~0 for the
 * user.
 */
export function useToursSeen(): {
  isSeen: (key: TourKey) => boolean
  isLoading: boolean
} {
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  return {
    isLoading: profileQuery.isLoading,
    isSeen: (key: TourKey): boolean => {
      if (!profile) return true
      switch (key) {
        case 'home':
          return profile.home_tour_seen_at != null
        case 'gastos':
          return profile.gastos_tour_seen_at != null
        case 'fijos':
          return profile.fijos_tour_seen_at != null
        case 'control':
          return profile.control_tour_seen_at != null
      }
    },
  }
}
