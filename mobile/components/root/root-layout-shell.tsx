import '@/lib/runtime'
import { useCallback, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
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
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/callback" />
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
  // Track whether we should keep the overlay mounted while fading
  // out. We mount it as soon as `visible` flips true and only
  // unmount once the fade-out completes — that way the overlay can
  // animate to opacity 0 instead of just disappearing.
  const [mounted, setMounted] = useState(visible)
  const opacity = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      opacity.value = withTiming(1, {
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
      })
      return
    }
    opacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        // The completion callback runs as a Reanimated worklet on
        // the UI thread. Calling React's `setMounted` (a JS-thread
        // setter) directly would crash without a stack trace in
        // Expo Go — same constraint as Intl/locale APIs inside
        // worklets. `runOnJS` marshals the call back to JS safely.
        if (finished) {
          runOnJS(setMounted)(false)
        }
      },
    )
  }, [visible, opacity])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  if (!mounted) return null

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlayShell, overlayStyle]}
      // pointerEvents stays auto while visible to block taps on the
      // route below; once we unmount (mounted=false above) the
      // overlay disappears entirely.
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Post-login bridge uses the warm variant (single fern,
          contemplative breath) — not the cold-start AuthLaunchSplash
          (which mirrors the welcome screen for the launch handoff).
          The splash receives `phase` so it can swap to an error
          fallback when a request fails / times out. */}
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
