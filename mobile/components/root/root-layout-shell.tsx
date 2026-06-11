import '@/lib/runtime'
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Stack, usePathname } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { authFlowLog } from '@/lib/auth-flow-logger'
import {
  AuthTransitionSplash,
  type AuthTransitionErrorKind,
  type AuthTransitionPhase,
} from '@/components/auth/auth-transition-splash'
import { BackgroundRelockWatcher } from '@/components/root/background-relock-watcher'
import { BackgroundSnapshotOverlay } from '@/components/root/background-snapshot-overlay'
import { GlobalConnectivityWatcher } from '@/components/root/global-connectivity-watcher'
import { InactivityRelockWatcher } from '@/components/root/inactivity-relock-watcher'
import { InteractionTrackerProvider } from '@/components/root/interaction-tracker-provider'
import { NotificationRouterBridge } from '@/components/root/notification-router-bridge'
import { RootErrorBoundary } from '@/components/root/root-error-boundary'
import { CaptchaBootErrorBanner } from '@/components/root/captcha-boot-error-banner'
import { AppProviders } from '@/providers/app-providers'
import { recordInteraction } from '@/features/auth/inactivity-tracker'
import { configureAuthFlow, dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { getOverlayMode } from '@/features/auth-flow/auth-flow-machine'
import {
  BRIDGE_FADE_IN_MS,
  BRIDGE_SCALE_FROM,
  SOAR_AWAY_MS,
  SOAR_SCALE_TO,
  SOAR_TRANSLATE_Y,
} from '@/features/auth-flow/auth-flow-motion'
import { useOfflineTakeover } from '@/features/auth-flow/offline-takeover'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { useAppTheme } from '@/theme/theme-provider'

let hasShownAppLaunchSplash = false

// Splash overlay timing — premium fluid transitions.
//
// ENTRADA (BRIDGE_FADE_IN_MS, snappy):
//   - cubic-bezier(0.23, 1, 0.32, 1) strong ease-out: starts FAST, settles
//   - scale 0.97 → 1 + translateY 0
//
// SALIDA (SOAR_AWAY_MS, dramatic soar-away):
//   - translateY 0 → -60 + scale 1 → 1.15 + fade out
//   - cubic-bezier(0.4, 0, 0.2, 1) Material standard — softer exit feel
//
// Los valores numéricos viven en auth-flow-motion.ts (spec 2026-06-11).
const EASE_OUT_STRONG = Easing.bezier(0.23, 1, 0.32, 1)
const EASE_OUT_SOFT = Easing.bezier(0.4, 0, 0.2, 1)

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
  // Adapters reales configurados apenas el shell monta — ANTES de que
  // cualquier pantalla (boot, login con deep-start) dispatchee eventos.
  // BootScreen también configura (idempotente); los dev journeys
  // reconfiguran con fakes y restauran al terminar.
  useEffect(() => {
    configureAuthFlow(realAuthFlowAdapters)
  }, [])

  const handleLaunchSplashComplete = useCallback(() => {
    hasShownAppLaunchSplash = true
    setLaunchSplashVisible(false)
  }, [])

  return (
    <RootErrorBoundary>
      <AppProviders>
        <ThemedRoot>
          {/*
            Sprint R-2 (2026-06-10) — global touch listener wraps the
            entire app tree so every onTouchStart resets the inactivity
            timer. Uses `pointerEvents="box-none"` so it observes touches
            without consuming them. Must sit outermost (just inside the
            ThemedRoot canvas) to catch interactions on every screen
            including the lock screen itself.
          */}
          <InteractionTrackerProvider>
          <NotificationRouterBridge />
          <NavigationInteractionRecorder />
          <ThemedRootStack />

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
            Background re-lock watcher: re-arms the per-launch app-lock
            (resetAppLock + replace('/')) when the app returns from
            background after >60s, so AppEntryGate re-prompts Face ID.
            Renders nothing of its own.
          */}
          <BackgroundRelockWatcher />

          {/*
            Sprint R-2 (2026-06-10) — foreground inactivity re-lock.
            Ticks every 30s while in foreground and calls
            resetAppLock + replace('/') after >15min with no
            interaction (touch / navigation / AppState→active).
            Pairs with BackgroundRelockWatcher but covers the
            distinct case of "app left unlocked in foreground while
            user is distracted". Renders nothing of its own.
          */}
          <InactivityRelockWatcher />

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
          <TransitionOverlay launchActive={isLaunchSplashVisible} />

          {/*
            Sprint I · I-6 — captcha misconfig banner. Only renders when
            getCaptchaBootError() returns non-null (non-dev build with no
            HCAPTCHA_SITE_KEY loaded). Lives on top of the Stack but below
            the transition overlay so the warning is dismissed during the
            full-screen auth splash. Subtle red bar at the top — visible
            enough to spot, not aggressive enough to derail QA.
          */}
          <CaptchaBootErrorBanner />

          {/*
            Sprint P · Audit #9 P-2 — background snapshot overlay.
            Mounted last so it sits on top of every other root-level
            chrome (transition splash, captcha banner, watcher
            components). On AppState.inactive / background it goes
            opaque to obscure sensitive UI before iOS captures the
            multitasking snapshot; flips back to transparent on
            active. See component for full rationale.
          */}
          <BackgroundSnapshotOverlay />
          </InteractionTrackerProvider>
        </ThemedRoot>
      </AppProviders>
    </RootErrorBoundary>
  )
}

/**
 * Themed root container. Vive dentro de AppProviders (que monta el
 * AppThemeProvider), entonces `useAppTheme()` está disponible acá.
 *
 * Razón de existir: el `<Tabs animation="shift">` desliza las escenas
 * horizontalmente, y durante la transición hay un frame donde el
 * parent del navigator queda visible entre la escena saliente y la
 * entrante. Si ese parent no tiene un bg theme-aware, en dark mode
 * el default-blanco de RN se cuela como flash visible.
 *
 * Setear `backgroundColor: theme.colors.canvas` acá garantiza que
 * incluso en el frame de overlap, el fondo expuesto sea forest deep
 * (#12211A) en dark mode o cream (#F4F2ED) en light. Sin flash.
 */
function ThemedRoot({ children }: PropsWithChildren) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      {children}
    </View>
  )
}

/**
 * Outer router `<Stack>` con `contentStyle` theme-aware. Tiene que ser
 * un componente separado porque necesita `useAppTheme()` (que requiere
 * estar dentro de `<AppProviders>`/`<AppThemeProvider>`).
 *
 * El `contentStyle.backgroundColor` cierra el white flash que se notaba
 * en dark mode: native-stack default es blanco en el screen content
 * container, y durante el slide entre dos screens hay un frame donde
 * el container default se cuela como flash visible. Forest deep
 * (#12211A) en dark mode · cream (#F4F2ED) en light. Match con el
 * outer ThemedRoot para que NO haya seam entre capas.
 */
function ThemedRootStack() {
  const { theme } = useAppTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
        animationMatchesGesture: true,
        freezeOnBlur: true,
        fullScreenGestureEnabled: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      {/* `index` and `auth/callback` are NEVER user-visible in steady
          state — index is `<AppEntryGate />` which redirects on every
          mount, and auth/callback is the OAuth landing that hands off
          immediately. We always navigate to/from these screens with the
          warm splash overlay covering the whole window. Animating their
          push transitions is wasted UI-thread work that contests the
          splash's halo pulse + breath worklets, and the user perceives
          it as a frame stutter ~1-2s into login (right when these
          transitions fire). The navigations are instant now; the splash
          does all the visual transition work on top. */}
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
    </Stack>
  )
}

function TransitionOverlay({ launchActive }: { launchActive: boolean }) {
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
  // Dos fuentes: la máquina auth-flow (viajes de auth) y el takeover
  // offline global (device sin red, cualquier pantalla). Renderizan el
  // mismo canvas; el error del viaje tiene precedencia en el copy.
  const machine = useAuthFlowState()
  const offlineTakeover = useOfflineTakeover()
  const machineMode = getOverlayMode(machine)
  const machineVisible = machineMode !== 'hidden'
  const machineError = typeof machineMode === 'object' ? machineMode.error : undefined

  // SOBERANÍA DEL COLD-START SPLASH (invariante 2, corregida 2026-06-11):
  // mientras el AuthLaunchSplash está en pantalla, el overlay queda
  // SUPRIMIDO. Con Face ID real (~1s) el FACE_ID_OK llega a mitad del
  // crecimiento del fern; sin esto el bridge (z50 > z20) tapaba el
  // launch splash y cortaba la animación — "fondo verde sin animación".
  // La máquina sigue trabajando por debajo (navega, precarga): el
  // launch splash ES la cobertura, y su propio fade-out a los ~2.2s
  // revela el destino ya montado. Si el auth tarda más que el growth,
  // el launch ya se fue y el bridge opera normal (fade-in + soar).
  // El takeover offline NO se suprime (es un error que debe verse).
  const suppressed = launchActive && !offlineTakeover

  const isRevealing = machineMode === 'revealing' && !suppressed

  // `revealing` mantiene el overlay montado/interactivo mientras el
  // soar-away corre; recién `hidden` lo libera.
  const effectiveVisible = (machineVisible && !suppressed) || offlineTakeover
  const isError = Boolean(machineError) || offlineTakeover
  const effectivePhase: AuthTransitionPhase = isError ? 'error' : 'showing'
  const effectiveErrorKind: AuthTransitionErrorKind | undefined = machineError
    ?? (offlineTakeover ? 'network' : undefined)

  const opacity = useSharedValue(effectiveVisible ? 1 : 0)
  const scale = useSharedValue(effectiveVisible ? 1 : BRIDGE_SCALE_FROM)
  const translateY = useSharedValue(0)

  // INVARIANTE 1 del spec: BRIDGE_OPAQUE se emite desde el callback del
  // fade-in — la navegación al destino ocurre SOLO con el overlay opaco.
  const reportOpaque = useCallback(() => {
    dispatchAuthFlow({ type: 'BRIDGE_OPAQUE' })
  }, [])

  // Animar solo cuando cambia la ANIMACIÓN requerida ('in' | 'soar' |
  // 'out'), no en cada cambio de fase. Primer mount no anima (los
  // shared values ya nacen en el end-state correcto).
  const prevKeyRef = useRef<string | null>(null)

  // Reporte inmediato de cobertura — dos casos donde el callback del
  // fade-in no va a disparar pero la pantalla YA está cubierta:
  //  1. Overlay suprimido por el launch splash: el launch ES la
  //     cobertura → navegar debajo es seguro (invariante 1 satisfecha).
  //  2. Overlay ya opaco de un viaje previo (re-entry sin re-animación).
  // El evento es idempotente (no-op si la máquina no espera opaque).
  const isBridging = machine.phase === 'bridging'
  useEffect(() => {
    if (!isBridging) return
    if (suppressed || (prevKeyRef.current === 'in' && opacity.value === 1)) {
      reportOpaque()
    }
  }, [isBridging, suppressed, opacity, reportOpaque])

  useEffect(() => {
    const key = isRevealing ? 'soar' : effectiveVisible ? 'in' : 'out'
    const prev = prevKeyRef.current
    prevKeyRef.current = key
    if (prev === key) return
    if (prev === null && key === 'out') return
    // 'soar' → 'out' (revealing → ready): el soar-away ya dejó los
    // shared values en el end-state de salida — re-animar es un no-op
    // visual que solo ensucia los logs.
    if (prev === 'soar' && key === 'out') return
    authFlowLog('overlay', `animating ${key}`)
    if (key === 'in') {
      const config = { duration: BRIDGE_FADE_IN_MS, easing: EASE_OUT_STRONG }
      scale.value = withTiming(1, config)
      translateY.value = withTiming(0, config)
      opacity.value = withTiming(1, config, (finished) => {
        if (finished) runOnJS(reportOpaque)()
      })
    } else {
      // 'soar' (revealing de la máquina) y 'out' (hide del store viejo)
      // comparten la salida soar-away.
      const config = { duration: SOAR_AWAY_MS, easing: EASE_OUT_SOFT }
      opacity.value = withTiming(0, config)
      scale.value = withTiming(SOAR_SCALE_TO, config)
      translateY.value = withTiming(SOAR_TRANSLATE_Y, config)
    }
  }, [effectiveVisible, isRevealing, opacity, scale, translateY, reportOpaque])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  // En web, si está hidden, no rendereamos children — evita el
  // wordmark fantasma del WarmFernLogo. En native always-mounted.
  if (Platform.OS === 'web' && !effectiveVisible) {
    return null
  }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlayShell, overlayStyle]}
      pointerEvents={effectiveVisible ? 'auto' : 'none'}
    >
      <AuthTransitionSplash phase={effectivePhase} errorKind={effectiveErrorKind} />
    </Animated.View>
  )
}

/**
 * Sprint R-2 (2026-06-10) — records a user-interaction on every
 * expo-router pathname change so navigation counts as activity for
 * the inactivity tracker. Without this, a flow driven entirely by
 * programmatic navigation (e.g. deep-link rebound, push that triggers
 * a redirect chain) could drift toward the inactivity threshold even
 * though the user is actively using the app.
 *
 * Lives inside AppProviders / ThemedRoot so the router context is
 * mounted; renders nothing.
 */
function NavigationInteractionRecorder() {
  const pathname = usePathname()
  useEffect(() => {
    recordInteraction()
  }, [pathname])
  return null
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlayShell: {
    zIndex: 50,
  },
})
