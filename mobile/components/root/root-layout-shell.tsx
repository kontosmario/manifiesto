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
import { NeoLaunchSplash } from '@/components/redesign/auth/neo-launch-splash'
import { authFlowLog } from '@/lib/auth-flow-logger'
import {
  NeoTransitionContent,
  type NeoTransitionPhase,
} from '@/components/redesign/auth/neo-transition-content'
import { BackgroundRelockWatcher } from '@/components/root/background-relock-watcher'
import { BackgroundSnapshotOverlay } from '@/components/root/background-snapshot-overlay'
import { GlobalConnectivityWatcher } from '@/components/root/global-connectivity-watcher'
import { InactivityRelockWatcher } from '@/components/root/inactivity-relock-watcher'
import { InteractionTrackerProvider } from '@/components/root/interaction-tracker-provider'
import { NotificationRouterBridge } from '@/components/root/notification-router-bridge'
import { ApplePayNotificationCopyBridge } from '@/features/apple-pay-capture/apple-pay-notification-copy-bridge'
import { ShareImportListenerBridge } from '@/features/share-import/share-import-listener'
import { PathnameMirror } from '@/components/root/pathname-mirror'
import { RootErrorBoundary } from '@/components/root/root-error-boundary'
import { CaptchaBootErrorBanner } from '@/components/root/captcha-boot-error-banner'
import { AppProviders } from '@/providers/app-providers'
import { recordInteraction } from '@/features/auth/inactivity-tracker'
import { configureAuthFlow, dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { applyLowTierRefreshRate } from '@/lib/preferred-refresh-rate'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { getOverlayMode, type BridgeErrorKind } from '@/features/auth-flow/auth-flow-machine'
import {
  BRIDGE_FADE_IN_MS,
  BRIDGE_SCALE_FROM,
  SOAR_AWAY_MS,
  SOAR_SCALE_TO,
  SOAR_TRANSLATE_Y,
} from '@/features/auth-flow/auth-flow-motion'
import {
  markLaunchSplashGone,
  markLaunchSplashShown,
} from '@/features/auth-flow/launch-splash-state'
import { useOfflineTakeover } from '@/features/auth-flow/offline-takeover'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { neoTokens } from '@/theme/neo-tokens'
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
  //   - native (iOS/Android): muestra el launch splash del rediseño
  //     (NeoLaunchSplash → AuthColdStart) al abrir la app por primera
  //     vez; auto-fade a los ~2.4s (+0.65s de fade). Brand polish para
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
    // Tier de gama baja: prefiere 60Hz para la ventana en paneles
    // forzados a 90/120Hz que ese hardware no puede alimentar. No-op en
    // iOS y en hardware capaz (ver mobile/lib/preferred-refresh-rate).
    applyLowTierRefreshRate()
  }, [])

  // Registro del entrance para el gate del min-hold (el soar jamás
  // corta el fern growth — ver launch-splash-state).
  useEffect(() => {
    if (isLaunchSplashVisible) markLaunchSplashShown()
  }, [isLaunchSplashVisible])

  const handleLaunchSplashComplete = useCallback(() => {
    hasShownAppLaunchSplash = true
    markLaunchSplashGone()
    setLaunchSplashVisible(false)
  }, [])

  // ─── Soberanía + salida del cold-start splash (spec 2026-06-11) ───
  // Durante el viaje de unlock (locked/bridging) el launch NO se
  // auto-esconde por timer: queda como LA superficie de marca (auroras
  // y partículas vivas) — clave en Expo Go, donde la sheet de passcode
  // tapa todo y al volver del success lo que se ve es este hero, no un
  // fern estático. La salida la decide la máquina:
  //   revealing → SOAR (el hero entero se eleva revelando el destino;
  //               el min-hold garantiza que el growth ya completó)
  //   fallback-login (cancel del prompt) → SOAR también — misma
  //               transición que el success, revelando el login que ya
  //               se montó instantáneo por debajo (pedido del owner)
  //   bridge-error / ready → FADE clásico de 220ms
  //   guest (sin sesión) → timer clásico intacto (handoff a welcome)
  const machineForLaunch = useAuthFlowState()
  const launchPhase = machineForLaunch.phase
  // locked:pin es DISTINTO de locked:biometric para el splash. El prompt
  // biométrico es UI del SISTEMA y flota sobre el splash → el splash
  // sigue siendo la superficie de marca (persistente). El pad de PIN es
  // UI de la APP (BootScreen lo monta inline DEBAJO del splash): si el
  // splash quedara persistente y opaco, taparía y bloquearía el pad para
  // siempre — no hay salida que no sea tocarlo (deadlock, review r2).
  // Por eso locked:pin trata al splash como salida (fade) para revelar el
  // pad neo que ya está montado debajo.
  const isPinLock =
    machineForLaunch.phase === 'locked' && machineForLaunch.method === 'pin'
  const launchPersistent =
    (launchPhase === 'locked' && !isPinLock) ||
    launchPhase === 'bridging' ||
    launchPhase === 'revealing'
  const launchExitMode: 'fade' | 'soar' | undefined = !isLaunchSplashVisible
    ? undefined
    : launchPhase === 'revealing' || launchPhase === 'fallback-login'
      ? 'soar'
      : launchPhase === 'bridge-error' || launchPhase === 'ready' || isPinLock
        ? 'fade'
        : undefined

  useEffect(() => {
    if (!isLaunchSplashVisible) return
    authFlowLog('launch', 'estado del cold-start splash', {
      phase: launchPhase,
      persistent: launchPersistent || launchExitMode !== undefined,
      exitMode: launchExitMode ?? 'ninguno',
    })
  }, [isLaunchSplashVisible, launchPhase, launchPersistent, launchExitMode])

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
          <PathnameMirror />
          <ShareImportListenerBridge />
          {/*
            Copy de la notificación local de la captura de Apple Pay. Va
            acá arriba y no en el layout de tabs porque el App Intent
            corre con la app en background: si el copy no está escrito,
            el intent guarda la captura pero no notifica, y la primera
            captura de una instalación nueva pasaría en silencio.
            Renderiza null.
          */}
          <ApplePayNotificationCopyBridge />
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
            out via its internal auto-hide timer and calls `onComplete`
            so we can dismount it. Visual del rediseño (NeoLaunchSplash →
            AuthColdStart) con la MISMA coordinación/props que el
            AuthLaunchSplash anterior.
          */}
          {isLaunchSplashVisible ? (
            <NeoLaunchSplash
              onComplete={handleLaunchSplashComplete}
              persistent={launchPersistent || launchExitMode !== undefined}
              exitMode={launchExitMode}
            />
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
 * AppThemeProvider), entonces `useAppTheme()` está disponible aquí.
 *
 * Razón de existir: el `<Tabs animation="shift">` desliza las escenas
 * horizontalmente, y durante la transición hay un frame donde el
 * parent del navigator queda visible entre la escena saliente y la
 * entrante. Si ese parent no tiene un bg theme-aware, en dark mode
 * el default-blanco de RN se cuela como flash visible.
 *
 * Setear el canvas del rediseño aquí garantiza que incluso en el frame
 * de overlap, el fondo expuesto sea salvia (#DCDFCD) en light o noche de
 * bosque (#0F1A13) en dark — el mismo que pintan las pantallas. Sin
 * flash y sin seam.
 */
function ThemedRoot({ children }: PropsWithChildren) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.root, { backgroundColor: neoTokens(theme.mode).bg }]}>
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
 * el container default se cuela como flash visible. Noche de bosque
 * (#0F1A13) en dark mode · salvia (#DCDFCD) en light. Match con el
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
        contentStyle: { backgroundColor: neoTokens(theme.mode).bg },
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
      {/* Post-refactor auth-flow (2026-06-11): TODA entrada root-level a
          los grupos (auth)/(app) ocurre cubierta (launch splash o bridge
          opaco) y el reveal lo hace el soar-away. El slide default del
          native-stack corría DEBAJO del soar (visible en el cancel →
          login como "slide raro") y es trabajo de UI thread que compite
          con la animación. Las transiciones INTERNAS de cada grupo
          conservan su animación propia ((auth) crossfade 240ms, (app)
          su stack/tabs). */}
      <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
      <Stack.Screen name="(app)" options={{ animation: 'none' }} />
    </Stack>
  )
}

function TransitionOverlay({ launchActive }: { launchActive: boolean }) {
  // ⚠ WRAPPER ALWAYS-MOUNTED en native, CONDICIONAL en web.
  //
  // Native (iOS/Android): este wrapper (shared values + Animated.View)
  // vive montado desde el app launch — la mecánica de fade/soar nunca
  // paga un mount-race. El CONTENIDO del rediseño
  // (NeoTransitionContent) dibuja null mientras está 'hidden' y monta
  // su branch al volverse visible: su stack (canvas Skia de
  // BrotParticles + ~15 views) es mucho más liviano que el viejo
  // WarmFernLogo + 36 fireflies CSS que exigía el always-mount, y
  // dejarlo tibio costaría un frame-callback 60fps permanente detrás
  // de la app (jank en Android de gama baja). El mount del branch
  // ocurre al despachar LOGIN_PENDING/unlock — antes del
  // router.replace y del cascade de refetches, que recién corren con
  // el overlay ya opaco.
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
  // mientras el launch splash (NeoLaunchSplash) está en pantalla, el overlay queda
  // SUPRIMIDO. Con Face ID real (~1s) el FACE_ID_OK llega a mitad del
  // crecimiento del fern; sin esto el bridge (z50 > z20) tapaba el
  // launch splash y cortaba la animación — "fondo verde sin animación".
  // La máquina sigue trabajando por debajo (navega, precarga): el
  // launch splash ES la cobertura, y su propio fade-out a los ~2.2s
  // revela el destino ya montado. Si el auth tarda más que el growth,
  // el launch ya se fue y el bridge opera normal (fade-in + soar).
  // El takeover offline NO se suprime (es un error que debe verse).
  const suppressed = launchActive && !offlineTakeover

  // El takeover offline tiene precedencia sobre el soar de la máquina
  // (review r2): si un viaje llega a 'revealing' mientras el takeover
  // sigue visible (reconexión: el auto-poll despacha RETRY y el prefetch
  // completa antes de que el watcher baje el takeover), sin este guard el
  // wrapper animaría 'soar' — la pantalla "Sin conexión" entera se
  // elevaría y luego re-entraría con 'in'. Con el takeover activo el
  // overlay se queda en 'in' hasta que el takeover se cierra.
  const isRevealing = machineMode === 'revealing' && !suppressed && !offlineTakeover

  // `revealing` mantiene el overlay montado/interactivo mientras el
  // soar-away corre; recién `hidden` lo libera.
  const effectiveVisible = (machineVisible && !suppressed) || offlineTakeover
  const isError = Boolean(machineError) || offlineTakeover
  // Fase para el contenido del rediseño (neo-transition-content):
  // 'hidden' cuando el overlay no se ve (el contenido drena su salida y
  // dibuja null); si se ve: error > revealing > bridge.
  const contentPhase: NeoTransitionPhase = !effectiveVisible
    ? 'hidden'
    : isError
      ? 'error'
      : isRevealing
        ? 'revealing'
        : 'bridge'
  const effectiveErrorKind: BridgeErrorKind | undefined = machineError
    ?? (offlineTakeover ? 'network' : undefined)
  // Journey para el mapeo del contenido (signup = cover simple, decisión
  // owner); 'revealing' ya no lo trae — el contenido latchea el último.
  const contentJourney =
    machine.phase === 'bridging' || machine.phase === 'bridge-error'
      ? machine.journey
      : undefined

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
    authFlowLog('overlay', `animating ${key}`, { suppressed, launchActive })
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
  }, [effectiveVisible, isRevealing, suppressed, launchActive, opacity, scale, translateY, reportOpaque])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  // En web, si está hidden, no rendereamos children — evita contenido
  // fantasma en el DOM (Reanimated v4 no garantiza opacity 0 ahí). En
  // native el WRAPPER queda always-mounted (invariante intacta); el
  // contenido del rediseño decide por sí mismo dibujar null en 'hidden'
  // (ver neo-transition-content.tsx — su stack Skia no debe quedar
  // tibio detrás de la app) y drena su salida antes de soltarlo.
  if (Platform.OS === 'web' && !effectiveVisible) {
    return null
  }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlayShell, overlayStyle]}
      pointerEvents={effectiveVisible ? 'auto' : 'none'}
    >
      <NeoTransitionContent
        phase={contentPhase}
        errorKind={effectiveErrorKind}
        journey={contentJourney}
      />
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
