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
 * tour than to spam the user with one they've already seen.
 *
 * `null` vs `undefined` distinction:
 *   - `null` → server explicitly says "not seen" → fire tour
 *   - `undefined` → column hasn't loaded yet (e.g. the cache was
 *     seeded by `home_snapshot` RPC which only returns the original
 *     5 profile cols; the full `useMyProfile` fetch fills the tour
 *     cols a moment later) → treat as seen, don't fire
 *   - timestamp string → seen, don't fire
 *
 * Using strict `!== null` ensures `undefined` is NOT treated as
 * "not seen". `!= null` would mistakenly fire the tour during the
 * sub-second cache-warm-up window when home_snapshot has seeded the
 * profile but the explicit fetch hasn't completed.
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
          return profile.home_tour_seen_at !== null
        case 'gastos':
          return profile.gastos_tour_seen_at !== null
        case 'fijos':
          return profile.fijos_tour_seen_at !== null
        case 'control':
          return profile.control_tour_seen_at !== null
      }
    },
  }
}
