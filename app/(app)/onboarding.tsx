import { Redirect } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import { getIsAuthTransitionSplashVisible } from '@/lib/auth-transition-splash'
import { OnboardingScreen } from '@/screens/home/onboarding-screen'

export default function OnboardingRoute() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const profileQuery = useMyProfile(userId)
  const isLoading = sessionQuery.isLoading || (Boolean(userId) && profileQuery.isLoading)
  const shouldShowAuthTransitionSplash = getIsAuthTransitionSplashVisible()

  if (isLoading) {
    if (shouldShowAuthTransitionSplash) {
      return <AuthLaunchSplash persistent />
    }
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/welcome" />
  }

  // If onboarding is already complete, bounce to Home so this route
  // is effectively unreachable once done.
  if (profileQuery.data?.onboarding_completed_at) {
    return <Redirect href="/(app)/(tabs)/home" />
  }

  return <OnboardingScreen userId={userId} />
}
