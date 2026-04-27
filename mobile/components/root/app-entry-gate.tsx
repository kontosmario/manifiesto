import { useEffect } from 'react'
import { Redirect } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useMyProfile } from '@/features/profile/use-profile'
import { getIsAuthTransitionSplashVisible, hideAuthTransitionSplash } from '@/lib/auth-transition-splash'

export function AppEntryGate() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const familyQuery = useFamily(userId)
  const family = familyQuery.data ?? null
  const profileQuery = useMyProfile(userId)
  const isLoading =
    sessionQuery.isLoading ||
    (Boolean(userId) && familyQuery.isLoading) ||
    (Boolean(userId) && profileQuery.isLoading)
  const shouldShowAuthTransitionSplash = getIsAuthTransitionSplashVisible()

  useEffect(() => {
    if (!isLoading && shouldShowAuthTransitionSplash) {
      hideAuthTransitionSplash()
    }
  }, [isLoading, shouldShowAuthTransitionSplash])

  if (isLoading) {
    if (shouldShowAuthTransitionSplash) {
      return <AuthLaunchSplash persistent />
    }

    return <BlockingScreenView message="Abriendo Manifiesto..." />
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />
  }

  // First-login onboarding wizard — has to be checked BEFORE the
  // family fallback. Otherwise a brand-new user (just signed up, no
  // family yet, onboarding pending) gets bounced to /(auth)/join,
  // skipping the 5-step wizard that's supposed to handle family +
  // profile + finance setup. Mirrors the same precedence used in
  // `RequireAuth` (mobile/components/guards.tsx).
  if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
    return <Redirect href="/(app)/onboarding" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return <Redirect href="/(app)/(tabs)/home" />
}
