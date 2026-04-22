import { useEffect, type ReactNode } from 'react'
import { Redirect } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { getIsAuthTransitionSplashVisible, hideAuthTransitionSplash } from '@/lib/auth-transition-splash'

interface RequireAuthProps {
  children: (input: {
    userId: string
    familyId: string
    familyCode: string
  }) => ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
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

    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/login" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return children({
    userId,
    familyId: family.familyId,
    familyCode: family.familyCode,
  })
}

export function RequireGuest({
  allowFamilylessSession = false,
  children,
}: {
  allowFamilylessSession?: boolean
  children: ReactNode
}) {
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

    return <BlockingScreenView message="Preparando tu sesión..." />
  }

  if (session && family) {
    return <Redirect href="/(app)/(tabs)/home" />
  }

  if (session && !family && !allowFamilylessSession) {
    return <Redirect href="/(auth)/join" />
  }

  return children
}
