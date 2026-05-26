import { useEffect, type ReactNode } from 'react'
import { Redirect } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useMyProfile } from '@/features/profile/use-profile'
import {
  getIsAuthTransitionSplashVisible,
  markAuthTransitionLoaded,
} from '@/lib/auth-transition-splash'

interface RequireAuthProps {
  children: (input: {
    userId: string
    familyId: string
  }) => ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
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
      markAuthTransitionLoaded()
    }
  }, [isLoading, shouldShowAuthTransitionSplash])

  if (isLoading) {
    // Always render the passive backdrop. Do NOT mount a second
    // splash beneath the warm transition overlay (mounted at root) —
    // see the long comment in `app-entry-gate.tsx` for the full
    // diagnosis (duplicate fern + aurora + particle layers caused
    // 60→<30fps drops during auth, perceived as "right-to-center
    // entry" + "1-2s pause" on the warm fern).
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/welcome" />
  }

  // First-login onboarding wizard. Once the user finishes, the mutation
  // flips `onboarding_completed_at` and we fall through to the normal
  // family/home flow.
  if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
    return <Redirect href="/(app)/onboarding" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return children({
    userId,
    familyId: family.familyId,
  })
}

export function RequireGuest({
  // Accepted for backward compatibility — no longer affects routing.
  // `AppEntryGate` (the destination of the redirect below) is the
  // single source of truth for signed-in routing (lock / onboarding /
  // join / home), so this flag is no-op here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allowFamilylessSession: _allowFamilylessSession = false,
  children,
}: {
  allowFamilylessSession?: boolean
  children: ReactNode
}) {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const shouldShowAuthTransitionSplash = getIsAuthTransitionSplashVisible()

  useEffect(() => {
    if (!sessionQuery.isLoading && shouldShowAuthTransitionSplash) {
      markAuthTransitionLoaded()
    }
  }, [sessionQuery.isLoading, shouldShowAuthTransitionSplash])

  if (sessionQuery.isLoading) {
    // Same rationale as RequireAuth above — yield to the warm
    // overlay; don't mount a duplicate splash underneath.
    return <BlockingScreenView message="Preparando tu sesión..." />
  }

  // Route signed-in users through AppEntryGate (the `/` index) so the
  // app-lock gate, onboarding check, family check, and home routing
  // are all decided in ONE place. Previously this redirected straight
  // to home/join, which let a user bypass the lock screen by
  // navigating through any guest route (e.g. cancel Face ID →
  // back to welcome → "Ya tengo cuenta" → bypass).
  if (session) {
    return <Redirect href="/" />
  }

  return children
}
