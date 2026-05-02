import { useEffect } from 'react'
import { Redirect } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import {
  getIsAuthTransitionSplashVisible,
  markAuthTransitionLoaded,
} from '@/lib/auth-transition-splash'
import { shouldDismissAuthTransition } from '@/lib/auth-transition-dismiss-gate'
import { OnboardingScreen } from '@/screens/home/onboarding-screen'

export default function OnboardingRoute() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const profileQuery = useMyProfile(userId)
  const isLoading = sessionQuery.isLoading || (Boolean(userId) && profileQuery.isLoading)
  const shouldShowAuthTransitionSplash = getIsAuthTransitionSplashVisible()

  // Dismiss the post-signup / post-login splash once the route's own
  // data is ready. Without this, a brand-new account arriving here via
  // `router.replace('/(app)/onboarding')` from signup would sit under
  // the splash overlay until the 15s safety timer fired and surfaced
  // "La conexión está demorando" — even though loading already
  // succeeded.
  useEffect(() => {
    if (
      shouldDismissAuthTransition({
        isLoading,
        splashVisible: shouldShowAuthTransitionSplash,
      })
    ) {
      markAuthTransitionLoaded()
    }
  }, [isLoading, shouldShowAuthTransitionSplash])

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

  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <OnboardingScreen userId={userId} />
    </ModalContentEntrance>
  )
}
