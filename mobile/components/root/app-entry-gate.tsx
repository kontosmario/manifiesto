import { useEffect } from 'react'
import { Redirect } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { BlockingScreenView } from '@/components/shared/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { getIsAuthTransitionSplashVisible, hideAuthTransitionSplash } from '@/lib/auth-transition-splash'

export function AppEntryGate() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const familyQuery = useFamily(userId)
  const family = familyQuery.data ?? null
  const isLoading = sessionQuery.isLoading || (Boolean(userId) && familyQuery.isLoading)
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
    return <Redirect href="/(auth)/login" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return <Redirect href="/(app)/(tabs)/home" />
}
