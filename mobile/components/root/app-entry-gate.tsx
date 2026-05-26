import { useEffect } from 'react'
import { Redirect } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAppLockState } from '@/features/auth/app-lock-state'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useColdStartBiometricCheck } from '@/features/auth/use-cold-start-biometric-check'
import { useFamily } from '@/features/family/use-family'
import { useMyProfile } from '@/features/profile/use-profile'
import { useBackfillExistingUser } from '@/features/tours/use-backfill-existing-user'
import {
  getIsAuthTransitionSplashVisible,
  markAuthTransitionLoaded,
} from '@/lib/auth-transition-splash'

export function AppEntryGate() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const familyQuery = useFamily(userId)
  const family = familyQuery.data ?? null
  const profileQuery = useMyProfile(userId)
  useBackfillExistingUser(profileQuery.data?.onboarding_completed_at ?? null)
  // Cold-start biometric probe — read once, used to decide between
  // the welcome hero and the login auto-biometric route below. Runs
  // in parallel with the session check so by the time we know the
  // user has no session, we usually already know whether biometrics
  // are set up.
  const biometric = useColdStartBiometricCheck(userId ?? null)
  // App-lock gate: even when the session is valid we require a
  // biometric re-confirmation on every cold start (banking-app
  // pattern). `useAppLockState` starts at `false` after the JS
  // runtime initializes and flips to `true` once the user passes
  // Face ID / Touch ID via the lock screen below.
  const isAppUnlocked = useAppLockState()
  const isLoading =
    sessionQuery.isLoading ||
    (Boolean(userId) && familyQuery.isLoading) ||
    (Boolean(userId) && profileQuery.isLoading) ||
    // Wait for the biometric probe whenever its result affects the
    // routing decision — i.e. whenever we haven't already unlocked
    // the app this launch. Without this, family/profile finishing
    // before the SecureStore read could let AppEntryGate redirect
    // to home with `biometric.shouldUseBiometric === false` (the
    // stale initial value), skipping the lock gate entirely.
    (biometric.status === 'loading' && !isAppUnlocked)
  const shouldShowAuthTransitionSplash = getIsAuthTransitionSplashVisible()

  useEffect(() => {
    if (!isLoading && shouldShowAuthTransitionSplash) {
      markAuthTransitionLoaded()
    }
  }, [isLoading, shouldShowAuthTransitionSplash])

  if (isLoading) {
    // Always render the passive backdrop while loading. CRITICAL: do
    // NOT mount `AuthLaunchSplash` here when the warm transition
    // splash is visible. The warm splash (mounted at root in
    // `RootLayoutShell`) already covers the entire screen — rendering
    // a SECOND splash beneath it doubled the GPU load (two ferns +
    // two aurora layers + two particle fields running concurrently)
    // exactly during the auth + query window when JS/UI threads are
    // already at peak load. The user perceived the resulting frame
    // drops as a "right-to-center entry" + "1-2s pause" on the warm
    // fern. Yielding to the warm overlay alone restores 60fps.
    return <BlockingScreenView message="Abriendo Manifiesto..." />
  }

  if (!session) {
    // Returning user with biometrics set up — go straight to the
    // login screen with the auto-biometric flag. The login screen
    // reads `?autoBiometric=1`, fires the Face ID / Touch ID prompt
    // immediately on mount, and clears the param so a manual back-
    // navigate doesn't re-trigger. Skips the entire "Crear cuenta /
    // Ya tengo cuenta" hero for users who clearly don't need it.
    if (biometric.shouldUseBiometric) {
      return <Redirect href="/(auth)/login?autoBiometric=1" />
    }
    return <Redirect href="/(auth)/welcome" />
  }

  // App-lock gate: session is valid, but we still require a per-
  // launch biometric re-confirmation (banking pattern). Send the
  // user to the login screen with `lock=1` so it runs in unlock
  // mode (Face ID only, no Supabase refresh — the session is
  // already valid). On success the lock screen sets isUnlocked and
  // navigates back through here.
  //
  // Skip the lock when biometric isn't set up (e.g. new user just
  // signed up on this device): there's nothing to authenticate
  // against. The first successful manual login on this install
  // arms biometrics for subsequent launches.
  if (biometric.shouldUseBiometric && !isAppUnlocked) {
    return <Redirect href="/(auth)/login?autoBiometric=1&lock=1" />
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
