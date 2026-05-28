import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAppLockState } from '@/features/auth/app-lock-state'
import { getBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useColdStartBiometricCheck } from '@/features/auth/use-cold-start-biometric-check'
import { usePinLockCheck } from '@/features/auth/use-pin-lock-check'
import { useFamily } from '@/features/family/use-family'
import { useMyProfile } from '@/features/profile/use-profile'
import { useMigrateToursToBackend } from '@/features/tours/use-migrate-tours-to-backend'
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
  // Migrate any legacy device-local `tour-seen.*` flags (pre-2026-05-27)
  // and retry any pending fallbacks to the backend. One-shot per
  // install; flag-gated so subsequent launches are no-ops.
  useMigrateToursToBackend(userId)
  // Cold-start biometric probe — read once, used to decide between
  // the welcome hero and the login auto-biometric route below. Runs
  // in parallel with the session check so by the time we know the
  // user has no session, we usually already know whether biometrics
  // are set up.
  const biometric = useColdStartBiometricCheck(userId ?? null)
  // PIN-lock probe — same role as the biometric probe, for users who
  // set a PIN instead of (or in addition to) biometrics.
  const pin = usePinLockCheck(userId ?? null)
  // App-lock gate: even when the session is valid we require a
  // biometric re-confirmation on every cold start (banking-app
  // pattern). `useAppLockState` starts at `false` after the JS
  // runtime initializes and flips to `true` once the user passes
  // Face ID / Touch ID via the lock screen below.
  const isAppUnlocked = useAppLockState()
  // Flag read for the pre-onboarding biometric-setup gate. We resolve
  // it lazily here (no separate hook file) because the result only
  // influences one routing branch.
  //
  // Storage shape: { userId, shown } — keying the latest probe by
  // userId lets us derive `biometricSetupShown` / `biometricSetupFlagLoaded`
  // without explicitly resetting state when userId changes. That avoids
  // the `react-hooks/set-state-in-effect` lint flag and the dual setState
  // calls on user-change. While the read for the current userId is in
  // flight (or hasn't started), `flagLoaded` is false and
  // `shouldShowBiometricSetup` returns false → gate keeps loading,
  // preventing a redirect flicker when the flag is actually `true` but
  // the read hasn't resolved yet.
  const [latestProbe, setLatestProbe] = useState<{
    userId: string
    shown: boolean
  } | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void getBiometricSetupShown(userId).then((value) => {
      if (cancelled) return
      setLatestProbe({ userId, shown: value })
    })
    return () => {
      cancelled = true
    }
  }, [userId])
  const probeMatchesCurrentUser =
    latestProbe !== null && latestProbe.userId === userId
  const biometricSetupShown = probeMatchesCurrentUser && latestProbe.shown
  const biometricSetupFlagLoaded = probeMatchesCurrentUser
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
    (biometric.status === 'loading' && !isAppUnlocked) ||
    // Same wait for the PIN probe: its result feeds the lock decision,
    // so a premature redirect to home (with isSet stale-false) would
    // skip the lock for one tick.
    (pin.status === 'loading' && !isAppUnlocked) ||
    // Wait for the biometric-setup flag whenever it can change the
    // routing decision: we have a userId AND onboarding isn't yet
    // marked complete. Otherwise the read is irrelevant and we skip
    // the wait to keep returning users fast.
    (Boolean(userId) &&
      !profileQuery.data?.onboarding_completed_at &&
      !biometricSetupFlagLoaded)
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

  // App-lock gate: a valid session still needs a per-launch unlock when
  // EITHER biometrics or a PIN is set up. Biometrics take precedence on
  // the lock screen (Face ID auto-fires, with a "Usar PIN" fallback);
  // when only a PIN is set, go straight to the dedicated PIN screen.
  if ((biometric.shouldUseBiometric || pin.isSet) && !isAppUnlocked) {
    if (biometric.shouldUseBiometric) {
      return <Redirect href="/(auth)/login?autoBiometric=1&lock=1" />
    }
    return <Redirect href="/(auth)/pin-unlock" />
  }

  // First-login onboarding wizard — has to be checked BEFORE the
  // family fallback. Otherwise a brand-new user (just signed up, no
  // family yet, onboarding pending) gets bounced to /(auth)/join,
  // skipping the 5-step wizard that's supposed to handle family +
  // profile + finance setup. Mirrors the same precedence used in
  // `RequireAuth` (mobile/components/guards.tsx).
  if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
    if (
      shouldShowBiometricSetup({
        sessionUserId: userId,
        onboardingCompletedAt: profileQuery.data.onboarding_completed_at,
        biometricSetupShown,
        biometricSetupFlagLoaded,
      })
    ) {
      return <Redirect href="/(app)/biometric-setup" />
    }
    return <Redirect href="/(app)/onboarding" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return <Redirect href="/(app)/(tabs)/home" />
}
