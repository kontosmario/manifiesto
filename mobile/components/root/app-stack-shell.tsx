import { useEffect } from 'react'
import { Platform } from 'react-native'
import { Stack } from 'expo-router'
import { neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { AchievementUnlockBridge } from '@/components/bridges/achievement-unlock-bridge'
import { WeekCloseBridge } from '@/components/garden/week-close-bridge'
import { CycleWrappedBridge } from '@/components/bridges/cycle-wrapped-bridge'
import { NeoConfirmHost } from '@/components/ui/neo-confirm-host'
import { ToastHost } from '@/components/ui/toast-host'
import { NoSpendConfettiHost } from '@/components/ui/no-spend-confetti-host'
import { DailyBudgetNudgeBridge } from '@/components/bridges/daily-budget-nudge-bridge'
import { GlobalSettingsModalsHost } from '@/components/settings/global-settings-modals-host'
import { GlobalAdvisorActionHost } from '@/components/control-v2/global-advisor-action-host'
import { ArcHubA11yShield, ArcHubHost } from '@/components/navigation/arc-hub-host'
import { ArcHubProvider } from '@/components/navigation/arc-hub-context'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { isEntitlementResolved } from '@/features/billing/entitlement-snapshot'
import { useLastUserProfileSync } from '@/features/auth/use-last-user-profile-sync'
import { useTimezoneSync } from '@/features/auth/use-timezone-sync'
import { useLanguageSync } from '@/features/preferences/use-language-sync'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useAdvisorDismissalsSync } from '@/features/insights/control-dismiss-store'
import { useRegisterPushToken } from '@/features/push/use-register-push-token'
import { classifyBridgeLoadError } from '@/features/auth-flow/classify-bridge-load-error'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { motionDurations } from '@/lib/motion'
import { withStackDevLog } from '@/lib/dev/anim-log'

// ─── Navigation timing tokens ────────────────────────────────────
// Single source of truth for stack/modal animation pacing. Values
// match the curves prototyped in `docs/transitions-preview.html`.
//
// Note: `@react-navigation/native-stack` (which expo-router wraps)
// only honors `animationDuration` on Android — iOS uses the platform
// curves baked into UIKit. We still set it for consistency and so
// Android matches the same pacing as iOS visually. The
// `'ios_from_right'` animation type pins both platforms to the same
// horizontal slide instead of the platform default.
//
// ─── Architectural decision (2026-04-30) ─────────────────────────
// We deliberately stay on `@react-navigation/native-stack` and do
// NOT migrate to the JS-based `@react-navigation/stack` to get
// custom interpolators (parallax + scale on the outgoing screen,
// per-curve fine-tuning). Rationale:
//   1. Native-stack runs the transition off the JS thread on both
//      iOS (UIKit) and Android (Fragment transitions). The JS stack
//      drives every frame from the bridge — measurable jank on
//      lower-end Android, especially when Reanimated worklets are
//      already saturating the UI thread (which we use heavily).
//   2. Native-stack inherits the OS swipe-back gesture for free,
//      including the predictive back behavior on Android 14+. JS
//      stack reimplements it with PanResponder — buggier under
//      RNGH-heavy screens (we have many: Gastos, Fijos, modales).
//   3. The remaining UX gap (a parallax fade on the previous screen
//      during push) is small. The unified `ios_from_right` +
//      `motionDurations.enterStack` on both platforms already gives
//      a clean, consistent slide that matches the rest of the
//      motion language.
//   4. ModalContentEntrance (see `mobile/components/ui/modal-content-
//      entrance.tsx`) handles the modal-specific layered fade we
//      wanted, without touching the navigation primitive.
//
// Don't reintroduce a JS-stack PR without re-evaluating these four
// points. The trade-off is intentional, not an oversight.
const STACK_PUSH_ANIMATION =
  Platform.OS === 'ios' ? ('default' as const) : ('ios_from_right' as const)
const MODAL_ANIMATION =
  Platform.OS === 'ios' ? ('default' as const) : ('slide_from_bottom' as const)

// DEV-only: loguea focus/blur + frames de las pantallas de STACK (settings,
// asistente, modales, (tabs)) para ver las transiciones que el logger de
// tabs no captura. No-op en release.
const STACK_DEV_LISTENERS = withStackDevLog({})

export function AppStackShell() {
  // Theme se lee aquí para inyectar `contentStyle.backgroundColor` en el
  // Stack — cierra el white flash entre push/pop screens en dark mode
  // (native-stack default es blanco en el screen content container,
  // visible durante el slide).
  const { theme } = useAppTheme()
  // Fire the single snapshot RPC at the app-shell level, before any
  // screen or bridge mounts. The RPC seeds every downstream cache
  // (profile, family, expenses, fixed_expenses, family_finance, etc.),
  // so hooks below read from cache and skip their own network calls.
  const session = useAuthSession()
  const userId = session.data?.user.id
  const snapshot = useHomeSnapshot(userId)
  // El entitlement se dispara ACÁ, en paralelo con el snapshot, y no
  // cuando monta el SubscriptionGate. El gate vive dentro de las tabs,
  // así que su RPC recién arrancaba DESPUÉS de que las tabs pintaran:
  // una cuenta con el acceso pausado veía su Home con los números
  // reales hasta que la respuesta llegaba y el paywall la tapaba.
  // Misma query key → el gate la lee caliente, sin request extra.
  const entitlement = useEntitlement(userId)
  // Mirror the active user's email + display name + avatar to a
  // SecureStore-backed cache so the login screen can show a
  // personalized hero on next launch.
  useLastUserProfileSync()
  // Keep `profiles.timezone` aligned with the device's IANA TZ. The
  // streak trigger reads that column to decide which calendar day an
  // expense belongs to, so this sync is what makes the per-user day
  // boundary work in practice (instead of a hardcoded BA default).
  useTimezoneSync()
  // Keep `profiles.preferred_language` aligned with the resolved app
  // language. The server reads it to localize push notifications (built
  // by cron while the user is offline). Best-effort, same as timezone.
  useLanguageSync()

  // Hydrate the advisor-dismiss cache once familyId + userId are
  // known. This server-side store replaces the previous SecureStore-
  // backed dismissals — see `control-dismiss-store.ts` for details.
  // Mounted up here (BEFORE the conditional `BlockingScreenView`
  // return) so the hook order stays stable across renders. The hook
  // itself no-ops while either id is null.
  useAdvisorDismissalsSync({
    familyId: snapshot.data?.family?.familyId ?? null,
    userId: userId ?? null,
  })

  // Auto-registrar el token Expo Push del device cuando hay session
  // activa y el OS permission ya fue concedido. No-op si:
  //   - Build no soporta push (web, Expo Go, simulador)
  //   - El user nunca aceptó el permiso (el priming/Settings lo manejan)
  // Re-corre cuando cambia familyId para llevar la columna al día.
  useRegisterPushToken(userId ?? null, snapshot.data?.family?.familyId ?? null)

  // Bridge home_snapshot errors a la máquina auth-flow: si un viaje
  // está en `bridging` esperando el destino, el LOAD_FAILED muestra el
  // fallback de error con Reintentar. Fuera de bridging la máquina lo
  // ignora (no-op) — un refetch fallido en background no debe tapar la
  // app; el takeover offline global lo maneja GlobalConnectivityWatcher.
  useEffect(() => {
    if (!snapshot.isError) return

    // SIEMPRE verificación activa (round-trip real) antes de clasificar,
    // sin importar qué diga NetInfo: un fetch fallido reporta "Network
    // request failed" también cuando el usuario SÍ tiene internet (blip
    // transitorio, backend inalcanzable). Acusar "Sin conexión a internet"
    // en ese caso es falso — Apple Review rechazó 1.0(11) por esto (2.1a).
    // Con internet verificada el error se surfacea como demora ('timeout').
    let cancelled = false
    const message = String(snapshot.error?.message ?? '')
    void verifyInternetReachable().then((reachable) => {
      if (cancelled) return
      dispatchAuthFlow({
        type: 'LOAD_FAILED',
        kind: classifyBridgeLoadError(message, reachable),
      })
    })
    return () => {
      cancelled = true
    }
  }, [snapshot.isError, snapshot.error])

  // Reglas del predicado (fresco vs. restaurado del disco vs. error) en
  // `entitlement-snapshot.ts`, con sus tests.
  const entitlementResolved = isEntitlementResolved(entitlement)

  // If the user is authenticated, block the whole app tree until the
  // snapshot is seeded. Everything downstream (RequireAuth, tabs,
  // bridges) then mounts against a hot cache and issues zero extra
  // requests. Unauthenticated users pass through immediately —
  // RequireAuth below will redirect them to /(auth)/login.
  //
  // El entitlement entra en la MISMA espera (corre en paralelo, así que
  // no suma round-trips salvo que sea el más lento) para que la decisión
  // de acceso exista antes de la primera pintura del árbol.
  if (userId && ((!snapshot.data && !snapshot.isError) || !entitlementResolved)) {
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  // The global host is only useful once we know who the user is and
  // which family they belong to. The snapshot resolves both before we
  // render the stack (the BlockingScreenView above gates that), so by
  // this point both ids are stable.
  const familyId = snapshot.data?.family?.familyId ?? null

  return (
    <ArcHubProvider>
      <DailyBudgetNudgeBridge />
      {/* Fuera del gate de `userId && familyId` a propósito: reemplaza a
          `Alert.alert`, que estaba disponible en toda la app. Sin host
          montado `neoConfirm()` resuelve `false`, así que una pregunta
          hecha durante el logout se tragaría la respuesta en silencio. */}
      <NeoConfirmHost />
      {userId && familyId ? (
        <>
          <GlobalSettingsModalsHost familyId={familyId} userId={userId} />
          <GlobalAdvisorActionHost familyId={familyId} userId={userId} />
          <AchievementUnlockBridge userId={userId} />
          <WeekCloseBridge familyId={familyId} userId={userId} />
        </>
      ) : null}
      <ArcHubA11yShield>
        <Stack
          screenListeners={STACK_DEV_LISTENERS}
          screenOptions={{
            headerShown: false,
            animation: STACK_PUSH_ANIMATION,
            animationDuration: motionDurations.enterStack,
            animationMatchesGesture: true,
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
            gestureEnabled: true,
            // Closes the white flash that was visible during stack
            // push/pop in dark mode. Native-stack's screen content
            // container defaults to white on iOS/Android; during the
            // slide animation, the parent (this content container) is
            // revealed for a frame as the outgoing screen exits and the
            // incoming screen enters. Without an explicit theme-aware
            // background, that frame shows white-on-dark on dark theme.
            // Canvas match con `ThemedRoot` outer y con el default de
            // `Screen` para que NO haya seam entre capas (root → stack →
            // screen).
            contentStyle: { backgroundColor: neoTokens(theme.mode).bg },
          }}
        >
          {/* The `(tabs)` group is the first screen pushed onto this
              stack right after login (AppEntryGate redirects here once
              session+family resolve). The push transition fires while
              the warm splash is still fully opaque on top — animating
              it is wasted UI-thread work that contests the splash's
              worklets (~280ms of native push animation overlapping
              with snapshot RPC processing + tabs tree mounting at the
              same wall-clock moment). Setting `animation: 'none'`
              makes the push instant; the splash handles all the
              visual transition work itself. Pure-navigation pushes to
              `/(tabs)` after login (and any internal swap) become
              free UI-thread work. */}
          {/* freezeOnBlur: false SOLO aquí (override del global true). Con
              freezeOnBlur, al pushear una pantalla de Settings (card full-screen)
              el screen (tabs) se congela vía react-freeze + react-native-screens
              lo desconecta; al volver, Reanimated sigue avanzando los shared
              values pero escribe a un view tag inválido → TODAS las animaciones
              de los tabs quedan congeladas hasta reiniciar la app (confirmado:
              withRepeat sigue corriendo pero las views no actualizan). Mantener
              (tabs) sin freeze preserva el binding de las views. Trade-off: los
              tabs siguen vivos bajo Settings (costo de GPU menor mientras estás
              en una sub-pantalla), aceptable vs el freeze permanente. */}
          <Stack.Screen
            name="(tabs)"
            options={{ animation: 'none', freezeOnBlur: false }}
          />
          <Stack.Screen
            name="onboarding"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="onboarding-success"
            options={{
              // El wizard (onboarding) es un modal; success es el destino al
              // terminar. Un `fade` hace que success CRUCE suave sobre el wizard
              // (crossfade) en vez del modal-dismiss (slide-down) + card-push,
              // que se leía como un salto/parpadeo hacia atrás. Combinado con
              // quitar el replace imperativo redundante en el orquestador (el
              // gate redirige una sola vez), la transición queda limpia.
              animation: 'fade',
              animationDuration: motionDurations.enterModal,
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="trial-welcome"
            options={{
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="biometric-setup"
            options={{
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="pin-setup"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="add-expense"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="add-fixed-expense"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="add-income"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="household-setup"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="expense-categories"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="asistente"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="coach/[signalId]"
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              animation: MODAL_ANIMATION,
              animationDuration: motionDurations.enterModal,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="notifications"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/notifications"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/family-admin"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/asistente"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/plan"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/about"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings/delete-account"
            options={{
              freezeOnBlur: true,
              fullScreenGestureEnabled: false,
            }}
          />
        </Stack>
      </ArcHubA11yShield>
      {/* ÚLTIMO hermano a propósito, y fuera del escudo de accesibilidad.
          Es hermano del `<Stack>` y no hijo porque el arco sube ~250px por
          encima de la barra de tabs, y en Android un hijo fuera de los
          límites de su padre no recibe toques.

          Que vaya al final es lo que hace que RECIBA los toques cuando
          queda abierto por tap. `zIndex: 900` sigue puesto, pero ahora sólo
          como refuerzo del orden de pintado: apoyarse en él para el
          hit-test era apoyarse en el precedente equivocado —
          `BackgroundSnapshotOverlay` sube por `zIndex`, pero es una tapa de
          privacidad que nunca necesitó recibir un toque, así que probaba el
          dibujo y no el táctil. Último en el árbol es topmost sin depender
          de cómo cada plataforma ordene el hit-test.

          NO es un `<Modal>`: una ventana nativa montada a mitad del touch
          no recibe el stream del gesto que arrancó en la raíz de RNGH. */}
      {userId && familyId ? <ArcHubHost /> : null}
      {/* El wrapped va DESPUÉS del Stack y del ArcHubHost: es un overlay
          full-screen con gestos (tap zones, swipe-down, option cards) y la
          regla del repo es "último hermano para el hit-test; zIndex sólo
          refuerza el pintado". Antes vivía antes del Stack y subía sólo por
          zIndex — dibujaba bien pero el táctil dependía del orden de cada
          plataforma. ToastHost y el confetti quedan DESPUÉS del wrapped a
          propósito: un toast disparado por la decisión del sobrante tiene
          que verse (y tocarse) por encima del modal. */}
      {userId && familyId ? (
        <>
          <CycleWrappedBridge />
          <ToastHost />
          <NoSpendConfettiHost />
        </>
      ) : null}
    </ArcHubProvider>
  )
}
