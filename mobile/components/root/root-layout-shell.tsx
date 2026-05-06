import '@/lib/runtime'
import { useCallback, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Stack } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { AuthTransitionSplash } from '@/components/auth/auth-transition-splash'
import { GlobalConnectivityWatcher } from '@/components/root/global-connectivity-watcher'
import { NotificationRouterBridge } from '@/components/root/notification-router-bridge'
import { RootErrorBoundary } from '@/components/root/root-error-boundary'
import { AppProviders } from '@/providers/app-providers'
import { useAuthTransitionSplash } from '@/lib/auth-transition-splash'

let hasShownAppLaunchSplash = false

// Splash overlay timing — slow-in, fast-out follows the
// `exit-faster-than-enter` motion principle (rule §7).
const FADE_IN_MS = 220
const FADE_OUT_MS = 320

export function RootLayoutShell() {
  const [isLaunchSplashVisible, setLaunchSplashVisible] = useState(
    () => !hasShownAppLaunchSplash,
  )
  const authTransition = useAuthTransitionSplash()
  // Splash overlay shows for any phase that isn't 'hidden' — including
  // the error state, which renders the fallback UI inside the splash
  // canvas. The phase value is also passed down so the inner content
  // can swap between WarmFernLogo and the error fallback.
  const isAuthTransitionVisible = authTransition.phase !== 'hidden'

  const handleLaunchSplashComplete = useCallback(() => {
    hasShownAppLaunchSplash = true
    setLaunchSplashVisible(false)
  }, [])

  return (
    <RootErrorBoundary>
      <AppProviders>
        <View style={styles.root}>
          <NotificationRouterBridge />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
              animationMatchesGesture: true,
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
              gestureEnabled: true,
            }}
          >
            {/* `index` and `auth/callback` are NEVER user-visible
                in steady state — index is `<AppEntryGate />` which
                redirects on every mount, and auth/callback is the
                OAuth landing that hands off immediately. We always
                navigate to/from these screens with the warm splash
                overlay covering the whole window. Animating their
                push transitions is wasted UI-thread work that
                contests the splash's halo pulse + breath worklets,
                and the user perceives it as a frame stutter ~1-2s
                into login (right when these transitions fire). The
                navigations are instant now; the splash does all the
                visual transition work on top. */}
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
          </Stack>

          {/*
            Global connectivity watcher: when NetInfo reports the
            device is offline, promotes the auth-transition splash
            to its `error('network')` phase so the existing
            full-screen fallback (with Reintentar button that probes
            NetInfo before dismissing) becomes the offline experience
            for the entire app. Renders nothing of its own.
          */}
          <GlobalConnectivityWatcher />

          {/*
            Cold-start splash: shown ONCE per app launch, fades itself
            out via the internal HIDE_DELAY_MS timer and calls
            `onComplete` so we can dismount it.
          */}
          {isLaunchSplashVisible ? (
            <AuthLaunchSplash onComplete={handleLaunchSplashComplete} />
          ) : null}

          {/*
            Auth-transition splash: a persistent overlay tied to a
            global reactive flag (showAuthTransitionSplash /
            hideAuthTransitionSplash). Lives on top of the Stack
            during multi-step navigations (login → onboarding,
            signup → onboarding, etc.) so the user sees one
            continuous brand surface across redirects — no skeleton
            flashes, no FernLogo entrance replay, no remount cost.
          */}
          <TransitionOverlay
            visible={isAuthTransitionVisible}
            phase={authTransition.phase}
            errorKind={authTransition.errorKind}
          />
        </View>
      </AppProviders>
    </RootErrorBoundary>
  )
}

interface TransitionOverlayProps {
  visible: boolean
  phase: import('@/lib/auth-transition-splash').AuthTransitionPhase
  errorKind?: import('@/lib/auth-transition-splash').AuthTransitionErrorKind
}

function TransitionOverlay({ visible, phase, errorKind }: TransitionOverlayProps) {
  // ⚠ ALWAYS-MOUNTED.
  //
  // The overlay's children (`AuthTransitionSplash` → `WarmFernLogo` +
  // `AuroraLayer` + `ParticleLayer`) are mounted from app launch and
  // stay mounted forever. We only animate the outer opacity to show
  // / hide. Why: if we mount the children on demand (when login
  // fires), the native view tree is created at the WORST moment —
  // simultaneously with the auth request, the `router.replace('/')`
  // re-render cascade, and the AppEntryGate query refetches. The
  // native UI thread is saturated for ~1s, and the WarmFernLogo's
  // entrance animation visibly stalls inside that window. The user
  // sees the fern "pause for a second and then continue" exactly
  // when the JS work peaks.
  //
  // Cost: the always-running halo pulse + breath + aurora + 24
  // particles consume some UI-thread cycles continuously, but
  // they're cheap (sin-based interpolations on shared values, no JS
  // round-trip per frame). The benefit — zero mount race during the
  // user's most attention-critical moment — is worth it.
  const opacity = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: visible ? FADE_IN_MS : FADE_OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    })
  }, [visible, opacity])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlayShell, overlayStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <AuthTransitionSplash phase={phase} errorKind={errorKind} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlayShell: {
    zIndex: 50,
  },
})
