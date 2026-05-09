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
  // Cold-start splash:
  //   - native (iOS/Android): muestra el AuthLaunchSplash al abrir la
  //     app por primera vez, fade-out a los 2.22s. Brand polish para
  //     dar sensación premium al cold-start.
  //   - web (browser): NO mostramos el splash. El welcome se renderiza
  //     directo. Razón: el splash y el welcome son DOS hero stacks
  //     superpuestos durante 220ms de fade-out; en web los safe-area
  //     insets, useReducedMotion, useWindowDimensions y el text
  //     wrapping resuelven async. Cualquier diferencia de timing
  //     entre los 2 trees genera desalineación visible (wordmark
  //     duplicado/saltando) — clase de bug que ya intentamos arreglar
  //     2 veces (commits 0a3e354 y ad8d2cf) sin resolver del todo.
  //     En web nadie ve el splash brand-polish anyway porque es
  //     contexto de test/demo, no producto en uso.
  const [isLaunchSplashVisible, setLaunchSplashVisible] = useState(
    () => Platform.OS !== 'web' && !hasShownAppLaunchSplash,
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
  // ⚠ ALWAYS-MOUNTED en native, CONDICIONAL en web.
  //
  // Native (iOS/Android): los children (AuthTransitionSplash →
  // WarmFernLogo + AuroraLayer + ParticleLayer) se mantienen
  // montados desde el app launch. Razón: si los montamos on-demand
  // (cuando login fires), el native view tree se crea en el peor
  // momento — simultáneamente con el auth request, el router.replace
  // y el cascade de refetches. La UI thread se satura ~1s y la
  // entrance animation del WarmFernLogo se traba visiblemente.
  // Mantenerlos always-mounted evita ese mount-race.
  //
  // Web (browser): NO podemos always-mount. En web Reanimated v4
  // no aplica `useAnimatedStyle({opacity: 0})` al DOM con la misma
  // garantía que en native. El WarmFernLogo (que tiene su propio
  // <Text>Manifiesto</Text>) queda VISIBLE en el DOM incluso con
  // opacity supuestamente 0 → wordmark duplicado superpuesto al
  // del welcome screen → bug visual reportado de "Manifiesto" doble
  // y "movimiento hacia abajo" (welcome wordmark en su pos + WFL
  // wordmark en otra pos).
  //
  // Diagnosticado con telemetry: wordmarkCount: 2 en TODOS los logs
  // de welcome (t=0s a t=15s). Confirma que las 2 instancias coexisten.
  //
  // En web los mount-races no aplican (no hay native UI thread; el
  // browser maneja todo en JS thread con concurrent rendering),
  // entonces unmount cuando hidden es safe + correcto.
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

  // En web, si está hidden, no rendereamos children — evita el
  // wordmark fantasma del WarmFernLogo. En native always-mounted.
  if (Platform.OS === 'web' && !visible) {
    return null
  }

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
